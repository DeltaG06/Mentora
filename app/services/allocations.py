from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import AllocationStatus
from app.models.user import Allocation, User

# Above this many active mentees an assignment still succeeds, with a warning.
MENTOR_CAPACITY = 15


def get_active_allocation(db: Session, student_id: int) -> Allocation | None:
    return db.scalar(
        select(Allocation).where(
            Allocation.student_id == student_id,
            Allocation.status == AllocationStatus.active,
        )
    )


def is_active_mentee(db: Session, mentor_id: int, student_id: int) -> bool:
    allocation = get_active_allocation(db, student_id)
    return allocation is not None and allocation.mentor_id == mentor_id


def active_mentee_ids(mentor_id: int):
    """Subquery of the student ids actively allocated to this mentor."""
    return select(Allocation.student_id).where(
        Allocation.mentor_id == mentor_id,
        Allocation.status == AllocationStatus.active,
    )


def active_mentee_count(db: Session, mentor_id: int) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Allocation)
        .where(
            Allocation.mentor_id == mentor_id,
            Allocation.status == AllocationStatus.active,
        )
    )


def same_department(a: User, b: User) -> bool:
    return (a.department or "").strip().lower() == (b.department or "").strip().lower()


def capacity_warnings(db: Session, mentor: User) -> list[str]:
    count = active_mentee_count(db, mentor.id)
    if count > MENTOR_CAPACITY:
        return [
            f"{mentor.name} now has {count} active mentees "
            f"(recommended maximum is {MENTOR_CAPACITY})"
        ]
    return []
