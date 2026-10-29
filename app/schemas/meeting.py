from datetime import datetime

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models.enums import (
    GroupSessionAudience,
    GroupSessionStatus,
    MeetingStatus,
    SlotStatus,
)
from app.schemas.flag import FlagOut, FlagStudent


def _required_text(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("cannot be blank")
    return value


class PersonBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


# --- slots ------------------------------------------------------------------


class SlotCreate(BaseModel):
    date_time: AwareDatetime
    duration_minutes: int = Field(default=30, ge=5, le=240)


class SlotMeetingBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student: FlagStudent
    agenda: str
    status: MeetingStatus


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mentor_id: int
    start_time: datetime
    end_time: datetime
    status: SlotStatus
    created_at: datetime
    meeting: SlotMeetingBrief | None = None


# --- meetings ---------------------------------------------------------------


class BookRequest(BaseModel):
    agenda: str = Field(min_length=1, max_length=2000)

    _agenda = field_validator("agenda")(_required_text)


class InviteRequest(BaseModel):
    student_id: int
    agenda: str = Field(
        default="Mentor-initiated guidance meeting", min_length=1, max_length=2000
    )

    _agenda = field_validator("agenda")(_required_text)


class MeetingSlot(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    start_time: datetime
    end_time: datetime
    status: SlotStatus
    mentor: PersonBrief


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slot: MeetingSlot
    student: FlagStudent
    agenda: str
    minutes: str | None
    status: MeetingStatus
    invited_by_mentor: bool
    created_at: datetime
    completed_at: datetime | None
    linked_flags: list[FlagOut] = Field(validation_alias="flags")


class MeetingComplete(BaseModel):
    minutes: str = Field(min_length=1)
    linked_flag_ids: list[int] = Field(default_factory=list)

    _minutes = field_validator("minutes")(_required_text)


class MeetingCompleteOut(BaseModel):
    meeting: MeetingOut
    flags_moved: list[FlagOut]


# --- group sessions ---------------------------------------------------------


class GroupSessionCreate(BaseModel):
    date_time: AwareDatetime
    duration_minutes: int = Field(default=60, ge=5, le=480)
    title: str = Field(min_length=1, max_length=200)
    agenda: str | None = None
    audience: GroupSessionAudience
    student_ids: list[int] | None = None

    _title = field_validator("title")(_required_text)

    @model_validator(mode="after")
    def check_selected(self) -> "GroupSessionCreate":
        if self.audience == GroupSessionAudience.selected and not self.student_ids:
            raise ValueError("student_ids is required when audience is 'selected'")
        return self


class AttendeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    student: FlagStudent
    attended: bool | None


class GroupSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mentor: PersonBrief
    title: str
    agenda: str | None
    minutes: str | None
    audience: GroupSessionAudience
    start_time: datetime
    end_time: datetime
    status: GroupSessionStatus
    created_at: datetime
    attendees: list[AttendeeOut] = Field(validation_alias="attendance")


class AttendanceIn(BaseModel):
    student_id: int
    present: bool


class GroupSessionComplete(BaseModel):
    minutes: str = Field(min_length=1)
    attendance: list[AttendanceIn] = Field(default_factory=list)

    _minutes = field_validator("minutes")(_required_text)
