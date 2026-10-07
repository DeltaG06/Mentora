from app.models.academics import (
    InternalMark,
    InternalSubmission,
    ResultSubject,
    Semester,
    SemesterResult,
)
from app.models.flag import Flag
from app.models.meeting import (
    GroupAttendance,
    GroupSession,
    Meeting,
    MeetingFlag,
    Slot,
)
from app.models.system import AuditLog, Notification
from app.models.user import Allocation, User

__all__ = [
    "Allocation",
    "AuditLog",
    "Flag",
    "GroupAttendance",
    "GroupSession",
    "InternalMark",
    "InternalSubmission",
    "Meeting",
    "MeetingFlag",
    "Notification",
    "ResultSubject",
    "Semester",
    "SemesterResult",
    "Slot",
    "User",
]
