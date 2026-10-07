from datetime import datetime

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    false,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import (
    GroupSessionAudience,
    GroupSessionStatus,
    MeetingStatus,
    SlotStatus,
)
from app.models.types import UTCDateTime, db_enum, utcnow

LIVE_MEETING = "status IN ('scheduled', 'completed')"


class Slot(Base):
    __tablename__ = "slots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    mentor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    start_time: Mapped[datetime] = mapped_column(UTCDateTime)
    end_time: Mapped[datetime] = mapped_column(UTCDateTime)
    status: Mapped[SlotStatus] = mapped_column(db_enum(SlotStatus, "slot_status"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Meeting(Base):
    __tablename__ = "meetings"
    __table_args__ = (
        Index(
            "uq_one_live_meeting_per_slot",
            "slot_id",
            unique=True,
            sqlite_where=text(LIVE_MEETING),
            postgresql_where=text(LIVE_MEETING),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # The mentor is the slot's mentor; it is not duplicated here.
    slot_id: Mapped[int] = mapped_column(ForeignKey("slots.id", ondelete="RESTRICT"))
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    agenda: Mapped[str] = mapped_column(Text)
    minutes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[MeetingStatus] = mapped_column(
        db_enum(MeetingStatus, "meeting_status")
    )
    invited_by_mentor: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class MeetingFlag(Base):
    __tablename__ = "meeting_flags"

    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="RESTRICT"), primary_key=True
    )
    flag_id: Mapped[int] = mapped_column(
        ForeignKey("flags.id", ondelete="RESTRICT"), primary_key=True
    )


class GroupSession(Base):
    __tablename__ = "group_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    mentor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(200))
    agenda: Mapped[str | None] = mapped_column(Text)
    minutes: Mapped[str | None] = mapped_column(Text)
    audience: Mapped[GroupSessionAudience] = mapped_column(
        db_enum(GroupSessionAudience, "group_session_audience")
    )
    start_time: Mapped[datetime] = mapped_column(UTCDateTime)
    end_time: Mapped[datetime] = mapped_column(UTCDateTime)
    status: Mapped[GroupSessionStatus] = mapped_column(
        db_enum(GroupSessionStatus, "group_session_status")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class GroupAttendance(Base):
    __tablename__ = "group_attendance"
    __table_args__ = (
        UniqueConstraint(
            "session_id", "student_id", name="uq_group_attendance_session_student"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("group_sessions.id", ondelete="RESTRICT")
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    # None until attendance is marked.
    attended: Mapped[bool | None]
