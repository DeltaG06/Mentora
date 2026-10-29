from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.jobs import SCHEDULER_TIMEZONE, create_scheduler, run_daily_jobs, run_reminder_job
from app.models import (
    AuditLog,
    Flag,
    GroupAttendance,
    GroupSession,
    Meeting,
    Notification,
    Slot,
)
from app.models.enums import (
    FlagRule,
    FlagStatus,
    GroupSessionAudience,
    GroupSessionStatus,
    MeetingStatus,
    SlotStatus,
    UserRole,
)
from app.models.types import utcnow
from app.services import notifications
from app.services.flag_engine import raise_flags
from app.services.reminders import send_due_reminders
from tests.helpers import allocate, make_semester, make_user

API = "/api/v1"


@pytest.fixture()
def people(db):
    desai = make_user(db, "desai", UserRole.mentor)
    rohan = make_user(db, "rohan", UserRole.student)
    priya = make_user(db, "priya", UserRole.student)
    allocate(db, rohan, desai)
    allocate(db, priya, desai)
    return desai, rohan, priya


def make_meeting(db, mentor, student, start, status=MeetingStatus.scheduled):
    slot = Slot(
        mentor_id=mentor.id,
        start_time=start,
        end_time=start + timedelta(minutes=30),
        status=SlotStatus.booked,
    )
    db.add(slot)
    db.flush()
    meeting = Meeting(slot_id=slot.id, student_id=student.id, agenda="SGPA", status=status)
    db.add(meeting)
    db.commit()
    return meeting


def make_group_session(db, mentor, students, start):
    session = GroupSession(
        mentor_id=mentor.id,
        title="Exam prep",
        audience=GroupSessionAudience.all,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status=GroupSessionStatus.scheduled,
    )
    db.add(session)
    db.flush()
    for student in students:
        db.add(GroupAttendance(session_id=session.id, student_id=student.id))
    db.commit()
    return session


def reminders_for(db, user_id) -> list[str]:
    return list(
        db.scalars(
            select(Notification.message)
            .where(
                Notification.user_id == user_id,
                Notification.type == notifications.MEETING_REMINDER,
            )
            .order_by(Notification.id)
        )
    )


# --- reminders --------------------------------------------------------------


def test_24h_then_1h_reminder_each_sent_once(db, people):
    desai, rohan, _ = people
    now = utcnow()
    meeting = make_meeting(db, desai, rohan, now + timedelta(hours=20))

    assert send_due_reminders(db, now) == 1
    assert send_due_reminders(db, now + timedelta(minutes=15)) == 0
    db.commit()
    assert meeting.rem_24_sent is True and meeting.rem_1h_sent is False
    assert len(reminders_for(db, rohan.id)) == 1
    assert len(reminders_for(db, desai.id)) == 1
    assert "within 24 hours" in reminders_for(db, rohan.id)[0]

    later = now + timedelta(hours=19, minutes=30)  # 30 min before the start
    assert send_due_reminders(db, later) == 1
    assert send_due_reminders(db, later + timedelta(minutes=15)) == 0
    db.commit()
    assert meeting.rem_1h_sent is True
    student_reminders = reminders_for(db, rohan.id)
    assert len(student_reminders) == 2 and "in about an hour" in student_reminders[1]
    assert len(reminders_for(db, desai.id)) == 2


def test_booked_inside_the_hour_gets_only_the_1h_reminder(db, people):
    desai, rohan, _ = people
    now = utcnow()
    meeting = make_meeting(db, desai, rohan, now + timedelta(minutes=40))

    assert send_due_reminders(db, now) == 1
    assert send_due_reminders(db, now + timedelta(minutes=15)) == 0
    db.commit()
    assert meeting.rem_24_sent is True and meeting.rem_1h_sent is True
    assert len(reminders_for(db, rohan.id)) == 1


def test_no_reminder_outside_the_window_or_when_not_scheduled(db, people):
    desai, rohan, priya = people
    now = utcnow()
    make_meeting(db, desai, rohan, now + timedelta(hours=25))
    make_meeting(db, desai, priya, now + timedelta(hours=2), status=MeetingStatus.cancelled)
    make_meeting(db, desai, rohan, now - timedelta(minutes=5))

    assert send_due_reminders(db, now) == 0
    assert db.query(Notification).count() == 0


def test_group_session_reminds_mentor_and_every_invitee(db, people):
    desai, rohan, priya = people
    now = utcnow()
    session = make_group_session(db, desai, [rohan, priya], now + timedelta(hours=3))

    assert send_due_reminders(db, now) == 1
    assert send_due_reminders(db, now) == 0
    db.commit()
    assert session.rem_24_sent is True and session.rem_1h_sent is False
    for user in (desai, rohan, priya):
        assert len(reminders_for(db, user.id)) == 1
    assert "Exam prep" in reminders_for(db, rohan.id)[0]


def test_cancelled_group_session_gets_no_reminder(db, people):
    desai, rohan, _ = people
    session = make_group_session(db, desai, [rohan], utcnow() + timedelta(hours=3))
    session.status = GroupSessionStatus.cancelled
    db.commit()
    assert send_due_reminders(db, utcnow()) == 0


def test_reminder_is_emailed(db, people, sent_emails):
    desai, rohan, _ = people
    make_meeting(db, desai, rohan, utcnow() + timedelta(hours=5))
    assert run_reminder_job(db) == {"reminders_sent": 1}
    assert sorted(to for to, _, _ in sent_emails) == sorted([rohan.email, desai.email])


# --- daily job --------------------------------------------------------------


def test_daily_job_raises_f5_and_escalates_with_audit(db, people):
    desai, rohan, priya = people
    admin = make_user(db, "shweta", UserRole.admin)
    now = utcnow()
    semester = make_semester(
        db, "Sem 3", date(2026, 7, 1), internal_deadline=now - timedelta(days=1)
    )
    stale = raise_flags(db, rohan, semester, [(FlagRule.F3, "SGPA 5.8 (below 6.0)")])[0]
    stale.raised_at = now - timedelta(days=15)
    db.commit()

    result = run_daily_jobs(db, now)
    assert result == {"deadline_flags_raised": 2, "flags_escalated": 1}
    f5_students = db.scalars(select(Flag.student_id).where(Flag.rule == FlagRule.F5)).all()
    assert sorted(f5_students) == sorted([rohan.id, priya.id])

    db.refresh(stale)
    assert stale.status == FlagStatus.escalated
    audit = db.scalars(select(AuditLog).where(AuditLog.action == "flag.escalate")).all()
    assert [(row.actor_id, row.entity_id) for row in audit] == [(None, stale.id)]
    assert db.scalar(
        select(Notification.id).where(
            Notification.user_id == admin.id,
            Notification.type == notifications.FLAG_ESCALATED,
        )
    )

    # Running again changes nothing.
    assert run_daily_jobs(db, now) == {"deadline_flags_raised": 0, "flags_escalated": 0}


# --- external trigger -------------------------------------------------------


def test_job_endpoint_is_disabled_without_secret(client):
    response = client.post(f"{API}/admin/jobs/run", headers={"X-Job-Secret": "anything"})
    assert response.status_code == 404


def test_job_endpoint_rejects_wrong_or_missing_secret(client, monkeypatch):
    monkeypatch.setattr(settings, "JOB_SECRET", "s3cret")
    assert client.post(f"{API}/admin/jobs/run").status_code == 401
    response = client.post(f"{API}/admin/jobs/run", headers={"X-Job-Secret": "wrong"})
    assert response.status_code == 401


def test_job_endpoint_runs_all_jobs(client, db, people, monkeypatch):
    monkeypatch.setattr(settings, "JOB_SECRET", "s3cret")
    desai, rohan, _ = people
    make_meeting(db, desai, rohan, utcnow() + timedelta(hours=2))

    response = client.post(f"{API}/admin/jobs/run", headers={"X-Job-Secret": "s3cret"})
    assert response.status_code == 200, response.text
    assert response.json() == {
        "deadline_flags_raised": 0,
        "flags_escalated": 0,
        "reminders_sent": 1,
    }
    assert len(reminders_for(db, rohan.id)) == 1


# --- scheduler --------------------------------------------------------------


def test_scheduler_has_daily_and_reminder_jobs():
    scheduler = create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}
    assert set(jobs) == {"daily", "reminders"}
    assert str(scheduler.timezone) == SCHEDULER_TIMEZONE
    daily = {field.name: str(field) for field in jobs["daily"].trigger.fields}
    assert daily["hour"] == "0" and daily["minute"] == "5"
    assert jobs["reminders"].trigger.interval == timedelta(minutes=15)
