"""Scheduled jobs: the daily deadline scan and escalation, and reminders.

The run_* functions own their commit and are what both the in-process
scheduler and POST /admin/jobs/run call. Schedules are in Asia/Kolkata (the
college's time zone); everything stored stays UTC.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.types import utcnow
from app.services import flag_engine
from app.services.audit import log_action
from app.services.reminders import send_due_reminders

logger = logging.getLogger(__name__)

SCHEDULER_TIMEZONE = "Asia/Kolkata"


def run_daily_jobs(db: Session, now=None) -> dict[str, int]:
    """Raise F5 for missed deadlines, then escalate stale open flags."""
    now = now or utcnow()
    raised = flag_engine.run_deadline_scan(db, now)
    escalated = flag_engine.escalate_stale_flags(db, now)
    for flag in escalated:
        log_action(
            db,
            actor_id=None,
            action="flag.escalate",
            entity="flag",
            entity_id=flag.id,
            details=flag.reason,
        )
    db.commit()
    return {"deadline_flags_raised": len(raised), "flags_escalated": len(escalated)}


def run_reminder_job(db: Session, now=None) -> dict[str, int]:
    sent = send_due_reminders(db, now or utcnow())
    db.commit()
    return {"reminders_sent": sent}


def _run_with_session(job) -> None:
    db = SessionLocal()
    try:
        logger.info("Job %s: %s", job.__name__, job(db))
    except Exception:
        db.rollback()
        logger.exception("Job %s failed", job.__name__)
    finally:
        db.close()


def create_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone=SCHEDULER_TIMEZONE)
    scheduler.add_job(
        _run_with_session,
        "cron",
        hour=0,
        minute=5,
        args=[run_daily_jobs],
        id="daily",
        coalesce=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        _run_with_session,
        "interval",
        minutes=15,
        args=[run_reminder_job],
        id="reminders",
        coalesce=True,
    )
    return scheduler
