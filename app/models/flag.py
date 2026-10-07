from datetime import datetime

from sqlalchemy import ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.academics import Semester
from app.models.enums import FlagRule, FlagStatus
from app.models.types import UTCDateTime, db_enum, utcnow
from app.models.user import User

UNRESOLVED_FLAG = "status IN ('open', 'in_discussion', 'escalated')"


class Flag(Base):
    __tablename__ = "flags"
    __table_args__ = (
        Index(
            "uq_one_unresolved_flag",
            "student_id",
            "semester_id",
            "rule",
            unique=True,
            sqlite_where=text(UNRESOLVED_FLAG),
            postgresql_where=text(UNRESOLVED_FLAG),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    semester_id: Mapped[int] = mapped_column(
        ForeignKey("semesters.id", ondelete="RESTRICT")
    )
    rule: Mapped[FlagRule] = mapped_column(db_enum(FlagRule, "flag_rule"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[FlagStatus] = mapped_column(db_enum(FlagStatus, "flag_status"))
    raised_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    escalated_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    resolved_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    resolution_note: Mapped[str | None] = mapped_column(Text)

    student: Mapped[User] = relationship(foreign_keys=[student_id])
    semester: Mapped[Semester] = relationship()
