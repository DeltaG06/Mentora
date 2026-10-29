from sqlalchemy.orm import Session

from app.models.system import Notification
from app.models.user import User
from app.services.email import queue_email

# Canonical notification types. Reuse these everywhere; never inline strings.
ALLOCATION = "ALLOCATION"
FLAG_RAISED = "FLAG_RAISED"
FLAG_ESCALATED = "FLAG_ESCALATED"
FLAG_RESOLVED = "FLAG_RESOLVED"
SUBMISSION_VERIFIED = "SUBMISSION_VERIFIED"
SUBMISSION_REJECTED = "SUBMISSION_REJECTED"
MEETING_BOOKED = "MEETING_BOOKED"
MEETING_CANCELLED = "MEETING_CANCELLED"
MEETING_REMINDER = "MEETING_REMINDER"
GROUP_INVITE = "GROUP_INVITE"
ACCOUNT_STATUS = "ACCOUNT_STATUS"

# Types that are also emailed. In-app stays the canonical channel.
EMAIL_TYPES = frozenset({FLAG_RAISED, FLAG_ESCALATED, MEETING_BOOKED, MEETING_REMINDER})


def create_notification(
    db: Session, user_id: int, title: str, message: str, type: str
) -> Notification:
    """Add an in-app notification to the session; the caller commits.

    EMAIL_TYPES are also emailed, after the commit and off the request thread.
    Do not send email from callers.
    """
    notification = Notification(
        user_id=user_id, title=title, message=message, type=type
    )
    db.add(notification)
    if type in EMAIL_TYPES:
        user = db.get(User, user_id)
        if user is not None:
            queue_email(db, user.email, f"Mentora: {title}", message)
    return notification
