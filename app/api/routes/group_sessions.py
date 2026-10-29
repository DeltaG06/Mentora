"""Group sessions (contract Module 9). The server resolves the audience."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.routes.meetings import fmt_time
from app.db import get_db
from app.models.enums import (
    GroupSessionAudience,
    GroupSessionStatus,
    UserRole,
)
from app.models.flag import Flag
from app.models.meeting import GroupAttendance, GroupSession
from app.models.types import utcnow
from app.models.user import User
from app.schemas.meeting import (
    GroupSessionComplete,
    GroupSessionCreate,
    GroupSessionOut,
)
from app.services import notifications
from app.services.allocations import active_mentee_ids
from app.services.audit import log_action
from app.services.flag_engine import UNRESOLVED_STATUSES
from app.services.notifications import create_notification

router = APIRouter(tags=["group sessions"])

require_mentor = require_roles(UserRole.mentor)


def resolve_audience(db: Session, mentor: User, payload: GroupSessionCreate) -> list[int]:
    """Student ids invited to the session, decided server-side."""
    mentees = select(User.id).where(User.id.in_(active_mentee_ids(mentor.id)))
    if payload.audience == GroupSessionAudience.flagged:
        mentees = mentees.where(
            exists().where(
                Flag.student_id == User.id, Flag.status.in_(UNRESOLVED_STATUSES)
            )
        )
    ids = list(db.scalars(mentees.order_by(User.id)).all())

    if payload.audience == GroupSessionAudience.selected:
        wanted = list(dict.fromkeys(payload.student_ids))
        missing = [student_id for student_id in wanted if student_id not in ids]
        if missing:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"Student not found: {missing[0]}"
            )
        ids = wanted
    return ids


def get_visible_session(db: Session, session_id: int, user: User) -> GroupSession:
    session = db.get(GroupSession, session_id)
    if session is not None:
        if user.role == UserRole.admin:
            return session
        if user.role == UserRole.mentor and session.mentor_id == user.id:
            return session
        if user.role == UserRole.student and any(
            row.student_id == user.id for row in session.attendance
        ):
            return session
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Group session not found")


def get_own_scheduled(db: Session, session_id: int, mentor: User) -> GroupSession:
    session = db.get(GroupSession, session_id)
    if session is None or session.mentor_id != mentor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group session not found")
    if session.status != GroupSessionStatus.scheduled:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Group session is already {session.status.value}"
        )
    return session


@router.post(
    "/mentor/group-sessions",
    response_model=GroupSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    payload: GroupSessionCreate,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> GroupSession:
    if payload.date_time <= utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session must be in the future")
    student_ids = resolve_audience(db, mentor, payload)
    if not student_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No students match this audience")

    session = GroupSession(
        mentor_id=mentor.id,
        title=payload.title,
        agenda=payload.agenda,
        audience=payload.audience,
        start_time=payload.date_time,
        end_time=payload.date_time + timedelta(minutes=payload.duration_minutes),
        status=GroupSessionStatus.scheduled,
    )
    db.add(session)
    db.flush()
    for student_id in student_ids:
        db.add(GroupAttendance(session_id=session.id, student_id=student_id))
        create_notification(
            db,
            student_id,
            f"Group session: {payload.title}",
            f"{mentor.name} invited you to a group session on "
            f"{fmt_time(session.start_time)}.",
            notifications.GROUP_INVITE,
        )
    db.commit()
    db.refresh(session)
    return session


@router.get("/mentor/group-sessions", response_model=list[GroupSessionOut])
def mentor_sessions(
    status_: GroupSessionStatus | None = Query(default=None, alias="status"),
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> list[GroupSession]:
    query = select(GroupSession).where(GroupSession.mentor_id == mentor.id)
    if status_ is not None:
        query = query.where(GroupSession.status == status_)
    return db.scalars(query.order_by(GroupSession.start_time, GroupSession.id)).all()


@router.get("/students/me/group-sessions", response_model=list[GroupSessionOut])
def my_sessions(
    status_: GroupSessionStatus | None = Query(default=None, alias="status"),
    student: User = Depends(require_roles(UserRole.student)),
    db: Session = Depends(get_db),
) -> list[GroupSession]:
    query = (
        select(GroupSession)
        .join(GroupAttendance)
        .where(GroupAttendance.student_id == student.id)
    )
    if status_ is not None:
        query = query.where(GroupSession.status == status_)
    return db.scalars(query.order_by(GroupSession.start_time, GroupSession.id)).all()


@router.get("/group-sessions/{session_id}", response_model=GroupSessionOut)
def session_detail(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupSession:
    return get_visible_session(db, session_id, user)


@router.post("/mentor/group-sessions/{session_id}/complete", response_model=GroupSessionOut)
def complete_session(
    session_id: int,
    payload: GroupSessionComplete,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> GroupSession:
    session = get_own_scheduled(db, session_id, mentor)
    rows = {row.student_id: row for row in session.attendance}
    for entry in payload.attendance:
        if entry.student_id not in rows:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Student {entry.student_id} was not invited to this session",
            )
    present = {entry.student_id: entry.present for entry in payload.attendance}
    # Anyone not reported present is recorded absent.
    for student_id, row in rows.items():
        row.attended = present.get(student_id, False)

    session.status = GroupSessionStatus.completed
    session.minutes = payload.minutes
    log_action(
        db,
        actor_id=mentor.id,
        action="group_session.complete",
        entity="group_session",
        entity_id=session.id,
        details=f"present: {sum(1 for row in rows.values() if row.attended)}/{len(rows)}",
    )
    db.commit()
    db.refresh(session)
    return session


@router.post("/mentor/group-sessions/{session_id}/cancel", response_model=GroupSessionOut)
def cancel_session(
    session_id: int,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> GroupSession:
    session = get_own_scheduled(db, session_id, mentor)
    session.status = GroupSessionStatus.cancelled
    for row in session.attendance:
        create_notification(
            db,
            row.student_id,
            f"Group session cancelled: {session.title}",
            f"The session on {fmt_time(session.start_time)} was cancelled.",
            notifications.MEETING_CANCELLED,
        )
    db.commit()
    db.refresh(session)
    return session
