from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import ensure_active, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db import get_db
from app.models.enums import UserRole, UserStatus
from app.models.user import User
from app.schemas.user import RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user), user=UserOut.model_validate(user)
    )


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    if payload.roll_no and db.scalar(
        select(User).where(User.roll_no == payload.roll_no)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Roll number already registered")

    role = UserRole(payload.role)
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=role,
        # Mentors wait for admin approval; students are active immediately.
        status=UserStatus.pending if role == UserRole.mentor else UserStatus.active,
        phone=payload.phone,
        department=payload.department,
        roll_no=payload.roll_no,
        year=payload.year,
        division=payload.division,
        designation=payload.designation,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Lost a race with a concurrent registration; the DB unique index decides.
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Email or roll number already registered"
        )
    db.refresh(user)
    return token_response(user)


@router.post("/login", response_model=TokenResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> TokenResponse:
    # The OAuth2 form calls the field "username"; it carries the email.
    user = db.scalar(select(User).where(User.email == form.username.strip().lower()))
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    ensure_active(user)
    return token_response(user)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
