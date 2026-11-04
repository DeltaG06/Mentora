"""Role dashboards (contract Module 11): a thin layer over services.dashboards."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db import get_db
from app.models.enums import UserRole
from app.models.types import utcnow
from app.models.user import User
from app.schemas.dashboard import (
    AdminDashboardOut,
    AnalyticsOut,
    MenteeDetailOut,
    MentorDashboardOut,
    StudentDashboardOut,
)
from app.services import dashboards
from app.services.allocations import is_active_mentee

router = APIRouter(tags=["dashboards"])


@router.get("/mentor/dashboard", response_model=MentorDashboardOut)
def mentor_dashboard(
    mentor: User = Depends(require_roles(UserRole.mentor)),
    db: Session = Depends(get_db),
) -> dict:
    return dashboards.mentor_dashboard(db, mentor, utcnow())


@router.get("/mentor/mentees/{student_id}", response_model=MenteeDetailOut)
def mentee_detail(
    student_id: int,
    mentor: User = Depends(require_roles(UserRole.mentor)),
    db: Session = Depends(get_db),
) -> dict:
    student = db.get(User, student_id)
    if student is None or not is_active_mentee(db, mentor.id, student.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")
    return dashboards.mentee_detail(db, mentor, student)


@router.get("/students/me/dashboard", response_model=StudentDashboardOut)
def student_dashboard(
    student: User = Depends(require_roles(UserRole.student)),
    db: Session = Depends(get_db),
) -> dict:
    return dashboards.student_dashboard(db, student, utcnow())


@router.get("/admin/dashboard", response_model=AdminDashboardOut)
def admin_dashboard(
    semester_id: int | None = None,
    _admin: User = Depends(require_roles(UserRole.admin)),
    db: Session = Depends(get_db),
) -> dict:
    return dashboards.admin_dashboard(db, semester_id)


@router.get("/admin/analytics", response_model=AnalyticsOut)
def admin_analytics(
    semester_id: int | None = None,
    weeks: int = Query(default=8, ge=1, le=52),
    _admin: User = Depends(require_roles(UserRole.admin)),
    db: Session = Depends(get_db),
) -> dict:
    return dashboards.analytics(db, semester_id, weeks, utcnow())
