"""Slots and one-to-one meetings (contract Modules 7 and 8)."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db import get_db
from app.models.enums import FlagStatus, MeetingStatus, SlotStatus, UserRole
from app.models.flag import Flag
from app.models.meeting import Meeting, MeetingFlag, Slot
from app.models.types import utcnow
from app.models.user import User
from app.schemas.meeting import (
    BookRequest,
    InviteRequest,
    MeetingComplete,
    MeetingCompleteOut,
    MeetingOut,
    SlotCreate,
    SlotOut,
)
from app.services import flag_engine, notifications
from app.services.allocations import get_active_allocation, is_active_mentee
from app.services.audit import log_action
from app.services.notifications import create_notification

router = APIRouter(tags=["meetings"])

require_student = require_roles(UserRole.student)
require_mentor = require_roles(UserRole.mentor)

# A student may cancel a booking only up to this long before the slot starts.
STUDENT_CANCEL_NOTICE = timedelta(hours=2)
SLOT_TAKEN = "Slot is not open"


def fmt_time(value: datetime) -> str:
    return value.strftime("%d %b %Y %H:%M UTC")


def get_own_slot(db: Session, slot_id: int, mentor: User) -> Slot:
    slot = db.get(Slot, slot_id)
    if slot is None or slot.mentor_id != mentor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Slot not found")
    return slot


def get_party_meeting(db: Session, meeting_id: int, user: User) -> Meeting:
    """The meeting if the caller is its student or its mentor; 404 otherwise."""
    meeting = db.get(Meeting, meeting_id)
    if meeting is not None:
        if user.role == UserRole.student and meeting.student_id == user.id:
            return meeting
        if user.role == UserRole.mentor and meeting.slot.mentor_id == user.id:
            return meeting
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")


def ensure_bookable(slot: Slot) -> None:
    if slot.status != SlotStatus.open:
        raise HTTPException(status.HTTP_409_CONFLICT, SLOT_TAKEN)
    if slot.start_time <= utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Slot has already started")


def create_meeting(
    db: Session, slot: Slot, student: User, agenda: str, invited: bool
) -> Meeting:
    meeting = Meeting(
        slot_id=slot.id,
        student_id=student.id,
        agenda=agenda,
        status=MeetingStatus.scheduled,
        invited_by_mentor=invited,
    )
    slot.status = SlotStatus.booked
    db.add(meeting)
    try:
        db.flush()
    except IntegrityError:
        # uq_one_live_meeting_per_slot: someone else booked it first.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, SLOT_TAKEN)

    when = fmt_time(slot.start_time)
    if invited:
        create_notification(
            db,
            student.id,
            "Meeting invitation",
            f"{slot.mentor.name} scheduled a meeting with you on {when}: {agenda}",
            notifications.MEETING_BOOKED,
        )
    else:
        create_notification(
            db,
            student.id,
            "Meeting booked",
            f"Your meeting with {slot.mentor.name} is on {when}.",
            notifications.MEETING_BOOKED,
        )
        create_notification(
            db,
            slot.mentor_id,
            "Meeting booked",
            f"{student.name} ({student.roll_no}) booked {when}: {agenda}",
            notifications.MEETING_BOOKED,
        )
    db.commit()
    db.refresh(meeting)
    return meeting


def meeting_query(
    query: Select, status_: MeetingStatus | None, upcoming: bool | None
) -> Select:
    if status_ is not None:
        query = query.where(Meeting.status == status_)
    if upcoming is True:
        query = query.where(Slot.start_time >= utcnow())
    elif upcoming is False:
        query = query.where(Slot.start_time < utcnow())
    return query.order_by(Slot.start_time, Meeting.id)


# --- slots ------------------------------------------------------------------


@router.post("/mentor/slots", response_model=SlotOut, status_code=status.HTTP_201_CREATED)
def publish_slot(
    payload: SlotCreate,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> Slot:
    if payload.date_time <= utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Slot must be in the future")
    slot = Slot(
        mentor_id=mentor.id,
        start_time=payload.date_time,
        end_time=payload.date_time + timedelta(minutes=payload.duration_minutes),
        status=SlotStatus.open,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


@router.get("/mentor/slots", response_model=list[SlotOut])
def my_slots(
    status_: SlotStatus | None = Query(default=None, alias="status"),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> list[Slot]:
    query = select(Slot).where(Slot.mentor_id == mentor.id)
    if status_ is not None:
        query = query.where(Slot.status == status_)
    if from_ is not None:
        query = query.where(Slot.start_time >= from_)
    if to is not None:
        query = query.where(Slot.start_time <= to)
    return db.scalars(query.order_by(Slot.start_time, Slot.id)).all()


@router.patch("/mentor/slots/{slot_id}/cancel", response_model=SlotOut)
def cancel_slot(
    slot_id: int,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> Slot:
    slot = get_own_slot(db, slot_id, mentor)
    if slot.status not in (SlotStatus.open, SlotStatus.booked):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Slot is already {slot.status.value}"
        )

    meeting = slot.meeting
    if meeting is not None and meeting.status == MeetingStatus.scheduled:
        meeting.status = MeetingStatus.cancelled
        create_notification(
            db,
            meeting.student_id,
            "Meeting cancelled",
            f"{mentor.name} cancelled your meeting on {fmt_time(slot.start_time)}.",
            notifications.MEETING_CANCELLED,
        )
    slot.status = SlotStatus.cancelled
    db.commit()
    db.refresh(slot)
    return slot


@router.get("/students/me/mentor/slots", response_model=list[SlotOut])
def mentor_open_slots(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[Slot]:
    allocation = get_active_allocation(db, student.id)
    if allocation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No mentor assigned")
    slots = db.scalars(
        select(Slot)
        .where(
            Slot.mentor_id == allocation.mentor_id,
            Slot.status == SlotStatus.open,
            Slot.start_time > utcnow(),
        )
        .order_by(Slot.start_time, Slot.id)
    ).all()
    return slots


# --- booking and invitations ------------------------------------------------


@router.post(
    "/slots/{slot_id}/book",
    response_model=MeetingOut,
    status_code=status.HTTP_201_CREATED,
)
def book(
    slot_id: int,
    payload: BookRequest,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> Meeting:
    slot = db.get(Slot, slot_id)
    if slot is None or not is_active_mentee(db, slot.mentor_id, student.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Slot not found")
    ensure_bookable(slot)
    return create_meeting(db, slot, student, payload.agenda, invited=False)


@router.post(
    "/mentor/slots/{slot_id}/invite",
    response_model=MeetingOut,
    status_code=status.HTTP_201_CREATED,
)
def invite(
    slot_id: int,
    payload: InviteRequest,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> Meeting:
    slot = get_own_slot(db, slot_id, mentor)
    if not is_active_mentee(db, mentor.id, payload.student_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")
    ensure_bookable(slot)
    student = db.get(User, payload.student_id)
    return create_meeting(db, slot, student, payload.agenda, invited=True)


# --- meetings ---------------------------------------------------------------


@router.get("/students/me/meetings", response_model=list[MeetingOut])
def my_meetings(
    status_: MeetingStatus | None = Query(default=None, alias="status"),
    upcoming: bool | None = None,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[Meeting]:
    query = select(Meeting).join(Slot).where(Meeting.student_id == student.id)
    return db.scalars(meeting_query(query, status_, upcoming)).all()


@router.get("/mentor/meetings", response_model=list[MeetingOut])
def mentor_meetings(
    status_: MeetingStatus | None = Query(default=None, alias="status"),
    upcoming: bool | None = None,
    student_id: int | None = None,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> list[Meeting]:
    query = select(Meeting).join(Slot).where(Slot.mentor_id == mentor.id)
    if student_id is not None:
        query = query.where(Meeting.student_id == student_id)
    return db.scalars(meeting_query(query, status_, upcoming)).all()


@router.get("/meetings/{meeting_id}", response_model=MeetingOut)
def meeting_detail(
    meeting_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meeting:
    return get_party_meeting(db, meeting_id, user)


@router.post("/meetings/{meeting_id}/cancel", response_model=MeetingOut)
def cancel_meeting(
    meeting_id: int,
    user: User = Depends(require_roles(UserRole.student, UserRole.mentor)),
    db: Session = Depends(get_db),
) -> Meeting:
    meeting = get_party_meeting(db, meeting_id, user)
    if meeting.status != MeetingStatus.scheduled:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Meeting is already {meeting.status.value}"
        )
    slot = meeting.slot
    if user.role == UserRole.student and utcnow() > slot.start_time - STUDENT_CANCEL_NOTICE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Meetings can only be cancelled at least 2 hours before the slot",
        )

    meeting.status = MeetingStatus.cancelled
    # The slot goes back on offer.
    slot.status = SlotStatus.open
    when = fmt_time(slot.start_time)
    if user.role == UserRole.student:
        recipient = slot.mentor_id
        message = f"{user.name} ({user.roll_no}) cancelled the meeting on {when}."
    else:
        recipient = meeting.student_id
        message = f"{user.name} cancelled your meeting on {when}."
    create_notification(
        db, recipient, "Meeting cancelled", message, notifications.MEETING_CANCELLED
    )
    db.commit()
    db.refresh(meeting)
    return meeting


@router.post("/meetings/{meeting_id}/complete", response_model=MeetingCompleteOut)
def complete_meeting(
    meeting_id: int,
    payload: MeetingComplete,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> MeetingCompleteOut:
    meeting = get_party_meeting(db, meeting_id, mentor)
    if meeting.status != MeetingStatus.scheduled:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Meeting is already {meeting.status.value}"
        )

    flags = []
    for flag_id in dict.fromkeys(payload.linked_flag_ids):
        flag = db.get(Flag, flag_id)
        if flag is None or flag.student_id != meeting.student_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Flag {flag_id} does not belong to this student",
            )
        if flag.status == FlagStatus.resolved:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Flag {flag_id} is already resolved"
            )
        flags.append(flag)

    meeting.status = MeetingStatus.completed
    meeting.minutes = payload.minutes
    meeting.completed_at = utcnow()
    meeting.slot.status = SlotStatus.completed
    for flag in flags:
        db.add(MeetingFlag(meeting_id=meeting.id, flag_id=flag.id))
    moved = flag_engine.start_discussion(db, flags)

    log_action(
        db,
        actor_id=mentor.id,
        action="meeting.complete",
        entity="meeting",
        entity_id=meeting.id,
        details=f"linked flags: {[flag.id for flag in flags]}",
    )
    db.commit()
    db.refresh(meeting)
    for flag in moved:
        db.refresh(flag)
    return MeetingCompleteOut(meeting=meeting, flags_moved=moved)
