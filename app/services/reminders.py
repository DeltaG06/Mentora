"""T-24h and T-1h reminders for scheduled meetings and group sessions.

Each reminder fires once, tracked by the rem_24_sent / rem_1h_sent columns.
Something booked inside the last hour gets only the 1h reminder. Only
flushes; the scheduled job commits.
"""

from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.enums import GroupSessionStatus, MeetingStatus
from app.models.meeting import GroupSession, Meeting, Slot
from app.services import notifications
from app.services.notifications import create_notification

DAY_BEFORE = timedelta(hours=24)
HOUR_BEFORE = timedelta(hours=1)


def _fmt_time(value: datetime) -> str:
    return value.strftime("%d %b %Y %H:%M UTC")


def _due(item, start: datetime, now: datetime) -> str | None:
    """Which reminder is due ('1h', '24h' or None), marking it sent."""
    if start - now <= HOUR_BEFORE:
        if item.rem_1h_sent:
            return None
        item.rem_1h_sent = True
        item.rem_24_sent = True
        return "1h"
    if item.rem_24_sent:
        return None
    item.rem_24_sent = True
    return "24h"


def _lead(kind: str) -> str:
    return "in about an hour" if kind == "1h" else "within 24 hours"


def send_due_reminders(db: Session, now: datetime) -> int:
    """Notify both parties of everything starting within 24h. Returns reminders sent."""
    sent = 0
    window_end = now + DAY_BEFORE
    meetings = db.scalars(
        select(Meeting)
        .join(Meeting.slot)
        .where(
            Meeting.status == MeetingStatus.scheduled,
            Slot.start_time > now,
            Slot.start_time <= window_end,
            or_(Meeting.rem_24_sent.is_(False), Meeting.rem_1h_sent.is_(False)),
        )
        .order_by(Meeting.id)
    ).all()
    for meeting in meetings:
        slot = meeting.slot
        kind = _due(meeting, slot.start_time, now)
        if kind is None:
            continue
        when = _fmt_time(slot.start_time)
        create_notification(
            db,
            meeting.student_id,
            "Meeting reminder",
            f"Your meeting with {slot.mentor.name} starts {_lead(kind)} ({when}).",
            notifications.MEETING_REMINDER,
        )
        create_notification(
            db,
            slot.mentor_id,
            "Meeting reminder",
            f"Your meeting with {meeting.student.name} ({meeting.student.roll_no}) "
            f"starts {_lead(kind)} ({when}).",
            notifications.MEETING_REMINDER,
        )
        sent += 1

    sessions = db.scalars(
        select(GroupSession)
        .where(
            GroupSession.status == GroupSessionStatus.scheduled,
            GroupSession.start_time > now,
            GroupSession.start_time <= window_end,
            or_(GroupSession.rem_24_sent.is_(False), GroupSession.rem_1h_sent.is_(False)),
        )
        .order_by(GroupSession.id)
    ).all()
    for session in sessions:
        kind = _due(session, session.start_time, now)
        if kind is None:
            continue
        title = f"Group session reminder: {session.title}"
        message = (
            f"The group session '{session.title}' starts {_lead(kind)} "
            f"({_fmt_time(session.start_time)})."
        )
        recipients = [session.mentor_id] + [row.student_id for row in session.attendance]
        for user_id in recipients:
            create_notification(
                db, user_id, title, message, notifications.MEETING_REMINDER
            )
        sent += 1

    db.flush()
    return sent
