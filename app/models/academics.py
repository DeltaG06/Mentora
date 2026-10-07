from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import SemesterStatus, SubmissionStatus
from app.models.types import UTCDateTime, db_enum, utcnow
from app.models.user import User

# Rejected submissions are history and unlimited; only one may be live.
LIVE_SUBMISSION = "status IN ('pending', 'verified')"


class Semester(Base):
    __tablename__ = "semesters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(50), unique=True)
    # Orders semesters in time for flag baselines; id order is the fallback.
    start_date: Mapped[date | None] = mapped_column(Date)
    internal_deadline: Mapped[datetime | None] = mapped_column(UTCDateTime)
    result_deadline: Mapped[datetime | None] = mapped_column(UTCDateTime)
    status: Mapped[SemesterStatus] = mapped_column(
        db_enum(SemesterStatus, "semester_status"),
        default=SemesterStatus.open,
        server_default="open",
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class InternalSubmission(Base):
    __tablename__ = "internal_submissions"
    __table_args__ = (
        Index(
            "uq_one_live_internal_submission",
            "student_id",
            "semester_id",
            unique=True,
            sqlite_where=text(LIVE_SUBMISSION),
            postgresql_where=text(LIVE_SUBMISSION),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    semester_id: Mapped[int] = mapped_column(
        ForeignKey("semesters.id", ondelete="RESTRICT")
    )
    status: Mapped[SubmissionStatus] = mapped_column(
        db_enum(SubmissionStatus, "internal_submission_status")
    )
    rejection_note: Mapped[str | None] = mapped_column(Text)
    verified_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    submitted_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    student: Mapped["User"] = relationship(foreign_keys=[student_id])
    semester: Mapped[Semester] = relationship()
    marks: Mapped[list["InternalMark"]] = relationship(
        order_by="InternalMark.id", cascade="all, delete-orphan"
    )


class InternalMark(Base):
    __tablename__ = "internal_marks"
    __table_args__ = (
        UniqueConstraint(
            "submission_id",
            "subject_name",
            name="uq_internal_marks_submission_subject",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("internal_submissions.id", ondelete="RESTRICT")
    )
    subject_name: Mapped[str] = mapped_column(String(120))
    max_per_test: Mapped[int]
    i1: Mapped[int | None]
    i2: Mapped[int | None]
    i3: Mapped[int | None]
    effective_internal: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))


class SemesterResult(Base):
    __tablename__ = "semester_results"
    __table_args__ = (
        Index(
            "uq_one_live_semester_result",
            "student_id",
            "semester_id",
            unique=True,
            sqlite_where=text(LIVE_SUBMISSION),
            postgresql_where=text(LIVE_SUBMISSION),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    semester_id: Mapped[int] = mapped_column(
        ForeignKey("semesters.id", ondelete="RESTRICT")
    )
    sgpa: Mapped[Decimal] = mapped_column(Numeric(4, 2))
    status: Mapped[SubmissionStatus] = mapped_column(
        db_enum(SubmissionStatus, "semester_result_status")
    )
    proof_url: Mapped[str] = mapped_column(String(500))
    rejection_note: Mapped[str | None] = mapped_column(Text)
    verified_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    submitted_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    student: Mapped["User"] = relationship(foreign_keys=[student_id])
    semester: Mapped[Semester] = relationship()
    subjects: Mapped[list["ResultSubject"]] = relationship(
        order_by="ResultSubject.id", cascade="all, delete-orphan"
    )


class ResultSubject(Base):
    __tablename__ = "result_subjects"
    __table_args__ = (
        UniqueConstraint(
            "result_id", "subject_name", name="uq_result_subjects_result_subject"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    result_id: Mapped[int] = mapped_column(
        ForeignKey("semester_results.id", ondelete="RESTRICT")
    )
    subject_name: Mapped[str] = mapped_column(String(120))
    final_marks: Mapped[int]
    max_marks: Mapped[int]
