from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import AllocationStatus, UserRole, UserStatus
from app.models.types import UTCDateTime, db_enum, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(db_enum(UserRole, "user_role"))
    status: Mapped[UserStatus] = mapped_column(db_enum(UserStatus, "user_status"))
    phone: Mapped[str | None] = mapped_column(String(20))
    department: Mapped[str | None] = mapped_column(String(100))
    roll_no: Mapped[str | None] = mapped_column(String(30), unique=True)
    year: Mapped[int | None]
    division: Mapped[str | None] = mapped_column(String(10))
    designation: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, onupdate=utcnow
    )


class Allocation(Base):
    __tablename__ = "allocations"
    __table_args__ = (
        Index(
            "uq_one_active_allocation",
            "student_id",
            unique=True,
            sqlite_where=text("status = 'active'"),
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    mentor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    assigned_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[AllocationStatus] = mapped_column(
        db_enum(AllocationStatus, "allocation_status")
    )
    start_date: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    student: Mapped[User] = relationship(foreign_keys=[student_id])
    mentor: Mapped[User] = relationship(foreign_keys=[mentor_id])
