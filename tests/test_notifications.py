from datetime import date, timedelta

import pytest

from app.core.config import settings
from app.models import Notification
from app.models.enums import FlagRule, UserRole
from app.models.types import utcnow
from app.services import email as email_service
from app.services import notifications
from app.services.flag_engine import raise_flags
from app.services.notifications import create_notification
from tests.helpers import login_headers, make_semester, make_user

API = "/api/v1"


@pytest.fixture()
def rohan(db):
    return make_user(db, "rohan", UserRole.student)


@pytest.fixture()
def rohan_headers(client, rohan):
    return login_headers(client, rohan.email)


def notify(db, user, title="Hello", type=notifications.ALLOCATION, **fields):
    notification = create_notification(db, user.id, title, f"{title} body", type)
    for name, value in fields.items():
        setattr(notification, name, value)
    db.commit()
    return notification


# --- endpoints --------------------------------------------------------------


def test_list_is_newest_first_and_paginated(client, db, rohan, rohan_headers):
    now = utcnow()
    for i in range(3):
        notify(db, rohan, f"N{i}", created_at=now + timedelta(minutes=i))

    body = client.get(f"{API}/notifications?page_size=2", headers=rohan_headers).json()
    assert body["total"] == 3 and body["page"] == 1 and body["page_size"] == 2
    assert [n["title"] for n in body["items"]] == ["N2", "N1"]
    assert set(body["items"][0]) == {"id", "type", "title", "message", "is_read", "created_at"}

    page2 = client.get(f"{API}/notifications?page=2&page_size=2", headers=rohan_headers)
    assert [n["title"] for n in page2.json()["items"]] == ["N0"]


def test_users_see_only_their_own(client, db, rohan, rohan_headers):
    other = make_user(db, "priya", UserRole.student)
    notify(db, rohan, "Mine")
    notify(db, other, "Theirs")

    items = client.get(f"{API}/notifications", headers=rohan_headers).json()["items"]
    assert [n["title"] for n in items] == ["Mine"]
    count = client.get(f"{API}/notifications/unread-count", headers=rohan_headers)
    assert count.json() == {"count": 1}


def test_mark_read_updates_badge(client, db, rohan, rohan_headers):
    first = notify(db, rohan, "A")
    notify(db, rohan, "B")
    assert client.get(f"{API}/notifications/unread-count", headers=rohan_headers).json() == {
        "count": 2
    }

    response = client.patch(f"{API}/notifications/{first.id}/read", headers=rohan_headers)
    assert response.status_code == 200 and response.json()["is_read"] is True
    # Marking again is harmless.
    again = client.patch(f"{API}/notifications/{first.id}/read", headers=rohan_headers)
    assert again.status_code == 200
    assert client.get(f"{API}/notifications/unread-count", headers=rohan_headers).json() == {
        "count": 1
    }


def test_mark_read_on_someone_elses_is_404(client, db, rohan_headers):
    other = make_user(db, "priya", UserRole.student)
    theirs = notify(db, other, "Theirs")

    response = client.patch(f"{API}/notifications/{theirs.id}/read", headers=rohan_headers)
    assert response.status_code == 404
    assert client.patch(f"{API}/notifications/9999/read", headers=rohan_headers).status_code == 404
    db.refresh(theirs)
    assert theirs.is_read is False


def test_read_all_marks_only_own(client, db, rohan, rohan_headers):
    other = make_user(db, "priya", UserRole.student)
    notify(db, rohan, "A")
    notify(db, rohan, "B")
    theirs = notify(db, other, "Theirs")

    response = client.post(f"{API}/notifications/read-all", headers=rohan_headers)
    assert response.status_code == 204
    assert client.get(f"{API}/notifications/unread-count", headers=rohan_headers).json() == {
        "count": 0
    }
    db.refresh(theirs)
    assert theirs.is_read is False


def test_every_role_has_notifications(client, db, admin_headers):
    mentor = make_user(db, "desai", UserRole.mentor)
    headers = login_headers(client, mentor.email)
    notify(db, mentor, "For mentor")
    assert client.get(f"{API}/notifications/unread-count", headers=headers).json() == {"count": 1}
    assert client.get(f"{API}/notifications", headers=admin_headers).status_code == 200


def test_notifications_require_auth(client):
    assert client.get(f"{API}/notifications").status_code == 401
    assert client.get(f"{API}/notifications/unread-count").status_code == 401
    assert client.post(f"{API}/notifications/read-all").status_code == 401


# --- email ------------------------------------------------------------------


def test_email_types_are_emailed_after_commit(db, rohan, sent_emails):
    create_notification(db, rohan.id, "Flag raised: F3", "SGPA 5.8", notifications.FLAG_RAISED)
    assert sent_emails == []  # nothing goes out before the commit
    db.commit()
    assert sent_emails == [(rohan.email, "Mentora: Flag raised: F3", "SGPA 5.8")]


@pytest.mark.parametrize(
    "type_",
    [
        notifications.FLAG_RAISED,
        notifications.FLAG_ESCALATED,
        notifications.MEETING_BOOKED,
        notifications.MEETING_REMINDER,
    ],
)
def test_each_email_type_is_emailed(db, rohan, sent_emails, type_):
    notify(db, rohan, type=type_)
    assert len(sent_emails) == 1


def test_other_types_are_in_app_only(db, rohan, sent_emails):
    notify(db, rohan, type=notifications.ALLOCATION)
    notify(db, rohan, type=notifications.SUBMISSION_REJECTED)
    assert sent_emails == []
    assert db.query(Notification).count() == 2


def test_rollback_drops_queued_email(db, rohan, sent_emails):
    create_notification(db, rohan.id, "T", "M", notifications.FLAG_RAISED)
    db.rollback()
    db.commit()
    assert sent_emails == []


def test_savepoint_does_not_send_early_or_drop(db, rohan, sent_emails):
    create_notification(db, rohan.id, "First", "M", notifications.FLAG_RAISED)
    with db.begin_nested():
        pass
    try:
        with db.begin_nested():
            raise ValueError
    except ValueError:
        pass
    assert sent_emails == []
    db.commit()
    assert [subject for _, subject, _ in sent_emails] == ["Mentora: First"]


def test_raise_flags_emails_the_student(db, rohan, sent_emails):
    semester = make_semester(db, "Sem 1", date(2026, 1, 10))
    raise_flags(db, rohan, semester, [(FlagRule.F3, "SGPA 5.8 (below 6.0)")])
    db.commit()
    assert [to for to, _, _ in sent_emails] == [rohan.email]


def test_send_email_without_smtp_logs_and_skips(caplog):
    with caplog.at_level("INFO"):
        assert email_service.send_email("a@gec.ac.in", "Subj", "Body") is False
    assert "SMTP not configured" in caplog.text


class FakeSMTP:
    instances = []

    def __init__(self, host, port, timeout):
        self.host, self.port = host, port
        self.calls = []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.calls.append("starttls")

    def login(self, user, password):
        self.calls.append(("login", user, password))

    def send_message(self, message):
        self.calls.append(("send", message["To"], message["Subject"]))


def test_send_email_over_smtp(monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "mailer")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "pw")

    assert email_service.send_email("a@gec.ac.in", "Subj", "Body") is True
    (smtp,) = FakeSMTP.instances
    assert smtp.host == "smtp.example.com" and smtp.port == settings.SMTP_PORT
    assert smtp.calls == ["starttls", ("login", "mailer", "pw"), ("send", "a@gec.ac.in", "Subj")]


def test_send_email_failure_never_raises(monkeypatch, caplog):
    def broken(*args, **kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr(email_service.smtplib, "SMTP", broken)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    assert email_service.send_email("a@gec.ac.in", "Subj", "Body") is False
    assert "Failed to send email" in caplog.text
