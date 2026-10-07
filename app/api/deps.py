"""Shared API dependencies: current user and role guards."""

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db import get_db
from app.models.enums import UserRole, UserStatus
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def ensure_active(user: User) -> None:
    """Raise 403 with a clear message unless the account is active."""
    if user.status == UserStatus.pending:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account pending admin approval")
    if user.status == UserStatus.deactivated:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account deactivated")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    user_id = decode_access_token(token)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    ensure_active(user)
    return user


def require_roles(*roles: UserRole) -> Callable[..., User]:
    """Dependency factory: allow only the given roles, 403 otherwise."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not enough permissions")
        return user

    return checker
