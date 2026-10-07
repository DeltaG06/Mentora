from datetime import date, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.models.enums import SemesterStatus


class SemesterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    start_date: date | None
    internal_deadline: datetime | None
    result_deadline: datetime | None
    status: SemesterStatus


class SemesterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=50)
    start_date: date | None = None

    @field_validator("label")
    @classmethod
    def strip_label(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("label cannot be blank")
        return value


class SemesterUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Past deadlines are allowed on purpose: an admin may be correcting data.
    internal_deadline: AwareDatetime | None = None
    result_deadline: AwareDatetime | None = None
    status: SemesterStatus | None = None

    @field_validator("status")
    @classmethod
    def status_not_null(cls, value: SemesterStatus | None) -> SemesterStatus:
        if value is None:
            raise ValueError("status cannot be null")
        return value
