from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AllocationStatus


class StudentBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    roll_no: str | None
    department: str | None
    year: int | None
    division: str | None


class MentorBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    department: str | None
    designation: str | None
    email: str


class AllocationCreate(BaseModel):
    mentor_id: int
    student_ids: list[int] = Field(min_length=1, max_length=200)


class AssignmentResult(BaseModel):
    student_id: int
    status: Literal["assigned", "failed"]
    reason: str | None = None


class AllocationBulkOut(BaseModel):
    results: list[AssignmentResult]
    warnings: list[str]


class ReassignRequest(BaseModel):
    new_mentor_id: int


class AllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student: StudentBrief
    mentor: MentorBrief
    assigned_by: int
    status: AllocationStatus
    start_date: datetime
    ended_at: datetime | None


class ReassignOut(BaseModel):
    allocation: AllocationOut
    warnings: list[str]


class AllocationListOut(BaseModel):
    items: list[AllocationOut]
    total: int
    page: int
    page_size: int
