from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db import get_db
from app.models.academics import Semester
from app.models.enums import SemesterStatus, UserRole
from app.models.user import User
from app.schemas.semester import SemesterCreate, SemesterOut, SemesterUpdate

router = APIRouter(tags=["semesters"])

require_admin = require_roles(UserRole.admin)


@router.get("/semesters", response_model=list[SemesterOut])
def list_semesters(
    _user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Semester]:
    return db.scalars(select(Semester).order_by(Semester.id.desc())).all()


@router.post(
    "/admin/semesters", response_model=SemesterOut, status_code=status.HTTP_201_CREATED
)
def create_semester(
    payload: SemesterCreate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Semester:
    semester = Semester(
        label=payload.label, start_date=payload.start_date, status=SemesterStatus.open
    )
    db.add(semester)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Semester label already exists")
    db.refresh(semester)
    return semester


@router.patch("/admin/semesters/{semester_id}", response_model=SemesterOut)
def update_semester(
    semester_id: int,
    payload: SemesterUpdate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Semester:
    semester = db.get(Semester, semester_id)
    if semester is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Semester not found")

    # Closing a semester blocks new submissions; that rule lives in the
    # submissions routes, not here.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(semester, field, value)
    db.commit()
    db.refresh(semester)
    return semester
