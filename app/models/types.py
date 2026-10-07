from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum
from sqlalchemy.types import TypeDecorator


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Timezone-aware datetime, stored in UTC.

    SQLite drops tzinfo on the way out, so it is re-attached on load. Naive
    datetimes are rejected on the way in.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime is not allowed; use a timezone-aware value")
        return value.astimezone(timezone.utc)

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


def db_enum(enum_cls, name: str) -> Enum:
    """Enum column type that stores the member *values* (e.g. 'active')."""
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])
