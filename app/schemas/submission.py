from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models.enums import SubmissionStatus
from app.schemas.flag import FlagOut, FlagSemester, FlagStudent


def _unique_subject_names(subjects: list) -> list:
    names = [subject.subject_name.lower() for subject in subjects]
    if len(names) != len(set(names)):
        raise ValueError("subject names must be unique")
    return subjects


class SubjectName(BaseModel):
    subject_name: str = Field(min_length=1, max_length=120)

    @field_validator("subject_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("subject_name cannot be blank")
        return value


class RejectRequest(BaseModel):
    note: str

    @field_validator("note")
    @classmethod
    def note_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("a rejection note is required")
        return value


# --- internal submissions ---------------------------------------------------


class InternalSubjectIn(SubjectName):
    """One subject's internal tests. effective_internal is never accepted
    from the client; any such field is ignored and recomputed at verification."""

    i1: int | None = Field(default=None, ge=0)
    i2: int | None = Field(default=None, ge=0)
    i3: int | None = Field(default=None, ge=0)
    max_per_test: int = Field(gt=0)

    @model_validator(mode="after")
    def check_marks(self) -> "InternalSubjectIn":
        entered = [m for m in (self.i1, self.i2, self.i3) if m is not None]
        if not entered:
            raise ValueError("at least one of i1, i2, i3 is required")
        if any(mark > self.max_per_test for mark in entered):
            raise ValueError(f"marks must be within 0..{self.max_per_test}")
        return self


class InternalSubmissionUpdate(BaseModel):
    subjects: list[InternalSubjectIn] = Field(min_length=1)

    _unique = field_validator("subjects")(_unique_subject_names)


class InternalSubmissionCreate(InternalSubmissionUpdate):
    semester_id: int


class InternalSubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    subject_name: str
    i1: int | None
    i2: int | None
    i3: int | None
    max_per_test: int
    effective_internal: float | None


class InternalSubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student: FlagStudent
    semester: FlagSemester
    status: SubmissionStatus
    rejection_note: str | None
    verified_by: int | None
    verified_at: datetime | None
    submitted_at: datetime
    subjects: list[InternalSubjectOut] = Field(validation_alias="marks")


class InternalVerifyOut(BaseModel):
    submission: InternalSubmissionOut
    flags_raised: list[FlagOut]


# --- semester results -------------------------------------------------------


class ResultSubjectIn(SubjectName):
    final_marks: int = Field(ge=0)
    max_marks: int = Field(default=100, gt=0)

    @model_validator(mode="after")
    def check_marks(self) -> "ResultSubjectIn":
        if self.final_marks > self.max_marks:
            raise ValueError(f"final_marks must be within 0..{self.max_marks}")
        return self


class ResultSubjectsIn(BaseModel):
    subjects: list[ResultSubjectIn] = Field(min_length=1)

    _unique = field_validator("subjects")(_unique_subject_names)


class ResultSubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    subject_name: str
    final_marks: int
    max_marks: int


class ResultOut(BaseModel):
    """The stored proof path is never exposed; fetch the file via /proof."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    student: FlagStudent
    semester: FlagSemester
    sgpa: float
    status: SubmissionStatus
    rejection_note: str | None
    verified_by: int | None
    verified_at: datetime | None
    submitted_at: datetime
    subjects: list[ResultSubjectOut]


class ResultVerifyOut(BaseModel):
    result: ResultOut
    flags_raised: list[FlagOut]
