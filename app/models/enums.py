import enum


class UserRole(str, enum.Enum):
    student = "student"
    mentor = "mentor"
    admin = "admin"


class UserStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    deactivated = "deactivated"


class AllocationStatus(str, enum.Enum):
    active = "active"
    ended = "ended"


class SemesterStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class SubmissionStatus(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


class FlagRule(str, enum.Enum):
    F1 = "F1"
    F2 = "F2"
    F3 = "F3"
    F4 = "F4"
    F5 = "F5"


class FlagStatus(str, enum.Enum):
    open = "open"
    in_discussion = "in_discussion"
    resolved = "resolved"
    escalated = "escalated"


class SlotStatus(str, enum.Enum):
    open = "open"
    booked = "booked"
    completed = "completed"
    cancelled = "cancelled"


class MeetingStatus(str, enum.Enum):
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"


class GroupSessionAudience(str, enum.Enum):
    all = "all"
    flagged = "flagged"
    selected = "selected"


class GroupSessionStatus(str, enum.Enum):
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"
