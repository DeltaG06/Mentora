"""Outgoing email over SMTP, sent off the request thread.

Callers never send email directly: create_notification queues it on the
session, and it goes out only after that session commits.
"""

import logging
import smtplib
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)

PENDING_KEY = "pending_emails"

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="email")


def send_email(to: str, subject: str, body: str) -> bool:
    """Send one email synchronously. Never raises; returns whether it was sent."""
    if not settings.SMTP_HOST:
        logger.info("SMTP not configured; skipped email to %s: %s", to, subject)
        return False

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            if settings.SMTP_STARTTLS:
                smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            smtp.send_message(message)
    except Exception:
        logger.exception("Failed to send email to %s: %s", to, subject)
        return False
    return True


def queue_email(db: Session, to: str, subject: str, body: str) -> None:
    """Hold an email on the session until it commits."""
    db.info.setdefault(PENDING_KEY, []).append((to, subject, body))


# Both events also fire for savepoints (begin_nested); only the outermost
# transaction decides whether queued emails go out or are dropped.


@event.listens_for(Session, "after_commit")
def _dispatch_pending(session: Session) -> None:
    if session.in_nested_transaction():
        return
    for to, subject, body in session.info.pop(PENDING_KEY, []):
        _executor.submit(send_email, to, subject, body)


@event.listens_for(Session, "after_rollback")
def _discard_pending(session: Session) -> None:
    if session.in_nested_transaction():
        return
    session.info.pop(PENDING_KEY, None)
