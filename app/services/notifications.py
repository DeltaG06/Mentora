from sqlalchemy.orm import Session

from app.models.system import Notification

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


def create_notification(
    db: Session, user_id: int, title: str, message: str, type: str
) -> Notification:
    """Add an in-app notification to the session; the caller commits.

    Email delivery will hook in here later. Do not send email from callers.
    """
    notification = Notification(
        user_id=user_id, title=title, message=message, type=type
    )
    db.add(notification)
    return notification
