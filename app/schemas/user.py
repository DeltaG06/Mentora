from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.models.enums import UserRole, UserStatus

# bcrypt only reads the first 72 bytes of a password.
Password = Field(min_length=8, max_length=72)


class UserOut(BaseModel):
    """Public user profile. Deliberately has no password_hash field."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole
    status: UserStatus
    phone: str | None
    department: str | None
    roll_no: str | None
    year: int | None
    division: str | None
    designation: str | None
    created_at: datetime
    updated_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserListOut(BaseModel):
    items: list[UserOut]
    total: int
    page: int
    page_size: int


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)

    @field_validator("name")
    @classmethod
    def name_not_null(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("name cannot be null")
        return value


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Password


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    year: int | None = Field(default=None, ge=1, le=4)
    division: str | None = Field(default=None, min_length=1, max_length=10)

    @field_validator("year", "division")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("cannot be null")
        return value


class StatusUpdate(BaseModel):
    status: UserStatus


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Password
    role: Literal["student", "mentor"]
    phone: str | None = Field(default=None, max_length=20)
    department: str = Field(min_length=1, max_length=100)
    roll_no: str | None = Field(default=None, min_length=1, max_length=30)
    year: int | None = Field(default=None, ge=1, le=4)
    division: str | None = Field(default=None, min_length=1, max_length=10)
    designation: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, value: str) -> str:
        return value.lower()

    @field_validator("roll_no")
    @classmethod
    def normalise_roll_no(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else value

    @model_validator(mode="after")
    def check_role_fields(self) -> "RegisterRequest":
        if self.role == "student":
            required = ("roll_no", "year", "division")
            self.designation = None
        else:
            required = ("designation",)
            self.roll_no = self.year = self.division = None

        missing = [field for field in required if getattr(self, field) is None]
        if missing:
            raise ValueError(f"{self.role} registration requires: {', '.join(missing)}")
        return self
