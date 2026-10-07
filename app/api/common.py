"""HTTP-level helpers shared by the submission routes."""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.academics import Semester
from app.models.enums import SemesterStatus, SubmissionStatus
from app.models.user import User
from app.services.allocations import is_active_mentee

LIVE_STATUSES = (SubmissionStatus.pending, SubmissionStatus.verified)


def get_open_semester(db: Session, semester_id: int) -> Semester:
    semester = db.get(Semester, semester_id)
    if semester is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Semester not found")
    if semester.status != SemesterStatus.open:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "semester closed")
    return semester


def get_own_or_404(db: Session, model, record_id: int, student: User, what: str):
    record = db.get(model, record_id)
    if record is None or record.student_id != student.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")
    return record


def get_mentee_record_or_404(
    db: Session, model, record_id: int, mentor: User, what: str
):
    """The record, only if its student is actively allocated to this mentor."""
    record = db.get(model, record_id)
    if record is None or not is_active_mentee(db, mentor.id, record.student_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")
    return record


def ensure_editable(record) -> None:
    """Students may only edit a pending record."""
    if record.status == SubmissionStatus.verified:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "verified records are immutable"
        )
    if record.status == SubmissionStatus.rejected:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "rejected records cannot be edited; upload a new one",
        )


def ensure_pending(record) -> None:
    """Mentors may only verify or reject a pending record."""
    if record.status != SubmissionStatus.pending:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"record is already {record.status.value}"
        )
