from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.enums import FlagRule
from app.schemas.allocation import MentorBrief, StudentBrief
from app.schemas.flag import FlagOut, FlagSemester
from app.schemas.meeting import GroupSessionOut, MeetingOut
from app.schemas.submission import InternalSubmissionOut, ResultOut

Indicator = Literal["red", "amber", "green"]


class FlagCounts(BaseModel):
    open: int = 0
    in_discussion: int = 0
    escalated: int = 0
    resolved: int = 0


# --- mentor -----------------------------------------------------------------


class RosterEntry(BaseModel):
    student: StudentBrief
    latest_sgpa: float | None
    unresolved_flags: int
    indicator: Indicator


class MentorDashboardOut(BaseModel):
    mentees: list[RosterEntry]
    pending_internal_submissions: int
    pending_results: int
    upcoming_meetings: int
    upcoming_group_sessions: int


class MenteeProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str | None
    roll_no: str | None
    department: str | None
    year: int | None
    division: str | None


class MenteeDetailOut(BaseModel):
    student: MenteeProfile
    results: list[ResultOut]
    internal_submissions: list[InternalSubmissionOut]
    flags: list[FlagOut]
    meetings: list[MeetingOut]


# --- student ----------------------------------------------------------------


class SgpaPoint(BaseModel):
    semester: FlagSemester
    sgpa: float


class NextDeadline(BaseModel):
    semester: FlagSemester
    kind: Literal["internal", "result"]
    deadline: datetime
    submitted: bool


class StudentDashboardOut(BaseModel):
    mentor: MentorBrief | None
    sgpa_trend: list[SgpaPoint]
    flag_counts: FlagCounts
    active_flags: list[FlagOut]
    upcoming_meetings: list[MeetingOut]
    upcoming_group_sessions: list[GroupSessionOut]
    next_deadline: NextDeadline | None


# --- admin ------------------------------------------------------------------


class MentorStats(BaseModel):
    mentor: MentorBrief
    active_mentees: int
    meetings_completed: int
    meetings_scheduled: int
    group_sessions_completed: int
    unresolved_flags: int


class AdminDashboardOut(BaseModel):
    active_students: int
    allocated_students: int
    coverage_percent: float
    pending_mentors: int
    flag_counts: FlagCounts
    avg_resolution_hours: float | None
    mentors: list[MentorStats]


class RuleCount(BaseModel):
    rule: FlagRule
    count: int


class WeekCount(BaseModel):
    week_start: date
    completed: int


class AnalyticsOut(BaseModel):
    flags_by_rule: list[RuleCount]
    meetings_trend: list[WeekCount]
