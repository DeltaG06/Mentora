from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db import get_db
from app.models.enums import UserRole, UserStatus
from app.models.user import User
from app.schemas.user import AdminUserUpdate, StatusUpdate, UserListOut, UserOut
from app.services.audit import log_action

router = APIRouter(prefix="/admin/users", tags=["admin"])

require_admin = require_roles(UserRole.admin)

# (from, to): approve mentor, deactivate, reactivate. Anything else is a 409.
ALLOWED_TRANSITIONS = {
    (UserStatus.pending, UserStatus.active),
    (UserStatus.active, UserStatus.deactivated),
    (UserStatus.deactivated, UserStatus.active),
}


def get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("", response_model=UserListOut)
def list_users(
    role: UserRole | None = None,
    status_: UserStatus | None = Query(default=None, alias="status"),
    department: str | None = None,
    year: int | None = Query(default=None, ge=1, le=4),
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserListOut:
    query = select(User)
    if role is not None:
        query = query.where(User.role == role)
    if status_ is not None:
        query = query.where(User.status == status_)
    if department:
        query = query.where(func.lower(User.department) == department.strip().lower())
    if year is not None:
        query = query.where(User.year == year)
    if search and search.strip():
        term = search.strip()
        query = query.where(
            or_(
                User.name.icontains(term, autoescape=True),
                User.roll_no.icontains(term, autoescape=True),
            )
        )

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    users = db.scalars(
        query.order_by(User.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return UserListOut(items=users, total=total, page=page, page_size=page_size)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    user = get_user_or_404(db, user_id)
    if user.role != UserRole.student:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Only students have year and division"
        )

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(user, field, value)
    if changes:
        log_action(
            db,
            actor_id=admin.id,
            action="user.update",
            entity="user",
            entity_id=user.id,
            details=", ".join(f"{field}={value}" for field, value in changes.items()),
        )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/status", response_model=UserOut)
def change_status(
    user_id: int,
    payload: StatusUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    user = get_user_or_404(db, user_id)
    if user.id == admin.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You cannot change your own status"
        )

    old, new = user.status, payload.status
    if (old, new) not in ALLOWED_TRANSITIONS:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Invalid status transition: {old.value} -> {new.value}",
        )

    user.status = new
    log_action(
        db,
        actor_id=admin.id,
        action="user.status_change",
        entity="user",
        entity_id=user.id,
        details=f"{old.value} -> {new.value}",
    )
    db.commit()
    db.refresh(user)
    return user
