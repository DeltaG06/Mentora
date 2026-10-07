from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_roles
from app.db import get_db
from app.models.enums import AllocationStatus, UserRole, UserStatus
from app.models.types import utcnow
from app.models.user import Allocation, User
from app.schemas.allocation import (
    AllocationBulkOut,
    AllocationCreate,
    AllocationListOut,
    AllocationOut,
    AssignmentResult,
    MentorBrief,
    ReassignOut,
    ReassignRequest,
)
from app.services import notifications
from app.services.allocations import (
    capacity_warnings,
    get_active_allocation,
    same_department,
)
from app.services.audit import log_action
from app.services.notifications import create_notification

admin_router = APIRouter(prefix="/admin/allocations", tags=["allocations"])
student_router = APIRouter(prefix="/students", tags=["students"])

require_admin = require_roles(UserRole.admin)

DEPARTMENTS_DIFFER = "mentor and student departments differ"
ALREADY_ALLOCATED = "student already has an active allocation"
STUDENT_NOT_FOUND = "student not found"


def get_active_mentor_or_404(db: Session, mentor_id: int) -> User:
    mentor = db.get(User, mentor_id)
    if (
        mentor is None
        or mentor.role != UserRole.mentor
        or mentor.status != UserStatus.active
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mentor not found")
    return mentor


def create_allocation(
    db: Session, student: User, mentor: User, admin: User
) -> Allocation | None:
    """Insert an active allocation, or return None if the student has one.

    The savepoint keeps one student's failure from rolling back the others;
    the partial unique index is the final arbiter under concurrency.
    """
    try:
        with db.begin_nested():
            allocation = Allocation(
                student_id=student.id,
                mentor_id=mentor.id,
                assigned_by=admin.id,
                status=AllocationStatus.active,
            )
            db.add(allocation)
            db.flush()
    except IntegrityError:
        return None
    return allocation


@admin_router.post("", response_model=AllocationBulkOut)
def assign_students(
    payload: AllocationCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AllocationBulkOut:
    mentor = get_active_mentor_or_404(db, payload.mentor_id)

    results: list[AssignmentResult] = []

    def failed(student_id: int, reason: str) -> None:
        results.append(
            AssignmentResult(student_id=student_id, status="failed", reason=reason)
        )

    # Each student succeeds or fails on its own; never all-or-nothing.
    for student_id in payload.student_ids:
        student = db.get(User, student_id)
        if (
            student is None
            or student.role != UserRole.student
            or student.status != UserStatus.active
        ):
            failed(student_id, STUDENT_NOT_FOUND)
            continue
        if not same_department(mentor, student):
            failed(student_id, DEPARTMENTS_DIFFER)
            continue
        if get_active_allocation(db, student_id) is not None:
            failed(student_id, ALREADY_ALLOCATED)
            continue
        allocation = create_allocation(db, student, mentor, admin)
        if allocation is None:
            failed(student_id, ALREADY_ALLOCATED)
            continue

        create_notification(
            db,
            student.id,
            "Mentor assigned",
            f"{mentor.name} is now your mentor.",
            notifications.ALLOCATION,
        )
        create_notification(
            db,
            mentor.id,
            "New mentee assigned",
            f"{student.name} ({student.roll_no}) has been assigned to you.",
            notifications.ALLOCATION,
        )
        log_action(
            db,
            actor_id=admin.id,
            action="allocation.create",
            entity="allocation",
            entity_id=allocation.id,
            details=f"student {student.id} -> mentor {mentor.id}",
        )
        results.append(AssignmentResult(student_id=student_id, status="assigned"))

    assigned_any = any(result.status == "assigned" for result in results)
    warnings = capacity_warnings(db, mentor) if assigned_any else []
    db.commit()
    return AllocationBulkOut(results=results, warnings=warnings)


@admin_router.post("/{allocation_id}/reassign", response_model=ReassignOut)
def reassign(
    allocation_id: int,
    payload: ReassignRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ReassignOut:
    old = db.get(Allocation, allocation_id)
    if old is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Allocation not found")
    if old.status != AllocationStatus.active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Allocation is not active")

    new_mentor = get_active_mentor_or_404(db, payload.new_mentor_id)
    student, old_mentor = old.student, old.mentor
    if new_mentor.id == old_mentor.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Student is already assigned to this mentor"
        )
    if not same_department(new_mentor, student):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Mentor and student departments differ"
        )

    # History is kept: the old row is ended, never deleted. It must be flushed
    # before the insert so the one-active-allocation index is satisfied.
    old.status = AllocationStatus.ended
    old.ended_at = utcnow()
    db.flush()

    new = Allocation(
        student_id=student.id,
        mentor_id=new_mentor.id,
        assigned_by=admin.id,
        status=AllocationStatus.active,
    )
    db.add(new)
    db.flush()

    create_notification(
        db,
        student.id,
        "Mentor changed",
        f"{new_mentor.name} is now your mentor.",
        notifications.ALLOCATION,
    )
    create_notification(
        db,
        old_mentor.id,
        "Mentee reassigned",
        f"{student.name} ({student.roll_no}) is no longer your mentee.",
        notifications.ALLOCATION,
    )
    create_notification(
        db,
        new_mentor.id,
        "New mentee assigned",
        f"{student.name} ({student.roll_no}) has been assigned to you.",
        notifications.ALLOCATION,
    )
    log_action(
        db,
        actor_id=admin.id,
        action="allocation.reassign",
        entity="allocation",
        entity_id=new.id,
        details=(
            f"student {student.id}: mentor {old_mentor.id} -> {new_mentor.id} "
            f"(ended allocation {old.id})"
        ),
    )
    warnings = capacity_warnings(db, new_mentor)
    db.commit()
    db.refresh(new)
    return ReassignOut(allocation=AllocationOut.model_validate(new), warnings=warnings)


@admin_router.get("", response_model=AllocationListOut)
def list_allocations(
    mentor_id: int | None = None,
    status_: AllocationStatus | None = Query(default=None, alias="status"),
    department: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AllocationListOut:
    query = select(Allocation)
    if mentor_id is not None:
        query = query.where(Allocation.mentor_id == mentor_id)
    if status_ is not None:
        query = query.where(Allocation.status == status_)
    if department:
        # Student and mentor always share a department.
        query = query.where(
            Allocation.student.has(
                func.lower(User.department) == department.strip().lower()
            )
        )

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    allocations = db.scalars(
        query.options(joinedload(Allocation.student), joinedload(Allocation.mentor))
        .order_by(Allocation.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return AllocationListOut(
        items=allocations, total=total, page=page, page_size=page_size
    )


@student_router.get("/me/mentor", response_model=MentorBrief)
def my_mentor(
    student: User = Depends(require_roles(UserRole.student)),
    db: Session = Depends(get_db),
) -> User:
    allocation = get_active_allocation(db, student.id)
    if allocation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No mentor assigned")
    return allocation.mentor
