from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import FlagRule, FlagStatus


class FlagStudent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    roll_no: str | None


class FlagSemester(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str


class FlagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student: FlagStudent
    semester: FlagSemester
    rule: FlagRule
    reason: str
    status: FlagStatus
    raised_at: datetime
    escalated_at: datetime | None
    resolved_at: datetime | None
    resolved_by: int | None
    resolution_note: str | None


class FlagListOut(BaseModel):
    items: list[FlagOut]
    total: int
    page: int
    page_size: int


class FlagResolve(BaseModel):
    resolution_note: str
