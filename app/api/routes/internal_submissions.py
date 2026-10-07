from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.common import (
    LIVE_STATUSES,
    ensure_editable,
    ensure_pending,
    get_mentee_record_or_404,
    get_open_semester,
    get_own_or_404,
)
from app.api.deps import require_roles
from app.db import get_db
from app.models.academics import InternalMark, InternalSubmission
from app.models.enums import SubmissionStatus, UserRole
from app.models.types import utcnow
from app.models.user import User
from app.schemas.submission import (
    InternalSubjectIn,
    InternalSubmissionCreate,
    InternalSubmissionOut,
    InternalSubmissionUpdate,
    InternalVerifyOut,
    RejectRequest,
)
from app.services import flag_engine, notifications
from app.services.allocations import active_mentee_ids
from app.services.audit import log_action
from app.services.notifications import create_notification

router = APIRouter(tags=["internal submissions"])

require_student = require_roles(UserRole.student)
require_mentor = require_roles(UserRole.mentor)

WHAT = "Internal submission"
LIVE_EXISTS = "A pending or verified internal submission already exists for this semester"


def build_marks(subjects: list[InternalSubjectIn]) -> list[InternalMark]:
    # effective_internal is deliberately left empty: it is computed at verification.
    return [
        InternalMark(
            subject_name=subject.subject_name,
            i1=subject.i1,
            i2=subject.i2,
            i3=subject.i3,
            max_per_test=subject.max_per_test,
        )
        for subject in subjects
    ]


# --- student ----------------------------------------------------------------


@router.post(
    "/students/me/internal-submissions",
    response_model=InternalSubmissionOut,
    status_code=status.HTTP_201_CREATED,
)
def submit(
    payload: InternalSubmissionCreate,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> InternalSubmission:
    semester = get_open_semester(db, payload.semester_id)

    # Rejected submissions are history and do not block a re-upload.
    live = db.scalar(
        select(InternalSubmission.id).where(
            InternalSubmission.student_id == student.id,
            InternalSubmission.semester_id == semester.id,
            InternalSubmission.status.in_(LIVE_STATUSES),
        )
    )
    if live is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, LIVE_EXISTS)

    submission = InternalSubmission(
        student_id=student.id,
        semester_id=semester.id,
        status=SubmissionStatus.pending,
        marks=build_marks(payload.subjects),
    )
    db.add(submission)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, LIVE_EXISTS)
    db.refresh(submission)
    return submission


@router.patch(
    "/students/me/internal-submissions/{submission_id}",
    response_model=InternalSubmissionOut,
)
def edit(
    submission_id: int,
    payload: InternalSubmissionUpdate,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> InternalSubmission:
    submission = get_own_or_404(db, InternalSubmission, submission_id, student, WHAT)
    ensure_editable(submission)

    # Flush the deletes first so a re-used subject name cannot collide.
    submission.marks.clear()
    db.flush()
    submission.marks.extend(build_marks(payload.subjects))
    db.commit()
    db.refresh(submission)
    return submission


@router.get(
    "/students/me/internal-submissions", response_model=list[InternalSubmissionOut]
)
def my_submissions(
    semester_id: int | None = None,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[InternalSubmission]:
    query = select(InternalSubmission).where(InternalSubmission.student_id == student.id)
    if semester_id is not None:
        query = query.where(InternalSubmission.semester_id == semester_id)
    return db.scalars(query.order_by(InternalSubmission.id.desc())).all()


# --- mentor -----------------------------------------------------------------


@router.get("/mentor/internal-submissions", response_model=list[InternalSubmissionOut])
def queue(
    status_: SubmissionStatus = Query(default=SubmissionStatus.pending, alias="status"),
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> list[InternalSubmission]:
    return db.scalars(
        select(InternalSubmission)
        .where(
            InternalSubmission.student_id.in_(active_mentee_ids(mentor.id)),
            InternalSubmission.status == status_,
        )
        .order_by(InternalSubmission.id)
    ).all()


@router.get(
    "/mentor/internal-submissions/{submission_id}", response_model=InternalSubmissionOut
)
def detail(
    submission_id: int,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> InternalSubmission:
    return get_mentee_record_or_404(db, InternalSubmission, submission_id, mentor, WHAT)


@router.post(
    "/mentor/internal-submissions/{submission_id}/verify",
    response_model=InternalVerifyOut,
)
def verify(
    submission_id: int,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> InternalVerifyOut:
    submission = get_mentee_record_or_404(
        db, InternalSubmission, submission_id, mentor, WHAT
    )
    ensure_pending(submission)

    # Never trust a client value: effective is always computed here.
    for mark in submission.marks:
        effective = flag_engine.compute_effective(mark.i1, mark.i2, mark.i3)
        mark.effective_internal = Decimal(str(round(effective, 2)))

    submission.status = SubmissionStatus.verified
    submission.verified_by = mentor.id
    submission.verified_at = utcnow()

    flags = flag_engine.on_internal_verified(db, submission)
    log_action(
        db,
        actor_id=mentor.id,
        action="internal_submission.verify",
        entity="internal_submission",
        entity_id=submission.id,
        details=f"flags raised: {len(flags)}",
    )
    db.commit()
    db.refresh(submission)
    return InternalVerifyOut(submission=submission, flags_raised=flags)


@router.post(
    "/mentor/internal-submissions/{submission_id}/reject",
    response_model=InternalSubmissionOut,
)
def reject(
    submission_id: int,
    payload: RejectRequest,
    mentor: User = Depends(require_mentor),
    db: Session = Depends(get_db),
) -> InternalSubmission:
    submission = get_mentee_record_or_404(
        db, InternalSubmission, submission_id, mentor, WHAT
    )
    ensure_pending(submission)

    submission.status = SubmissionStatus.rejected
    submission.rejection_note = payload.note
    create_notification(
        db,
        submission.student_id,
        "Internal marks rejected",
        f"{submission.semester.label}: {payload.note}",
        notifications.SUBMISSION_REJECTED,
    )
    db.commit()
    db.refresh(submission)
    return submission
