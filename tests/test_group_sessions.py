from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models import Notification, User
from app.models.enums import FlagRule, FlagStatus, UserRole
from app.models.types import utcnow
from app.services import notifications
from app.services.flag_engine import raise_flags
from tests.helpers import allocate, login_headers, make_semester, make_user

API = "/api/v1"


@pytest.fixture()
def world(client, db):
    semester = make_semester(db, "Sem 1", date(2026, 1, 10))
    desai = make_user(db, "desai", UserRole.mentor)
    other = make_user(db, "other", UserRole.mentor)
    rohan = make_user(db, "rohan", UserRole.student)
    asha = make_user(db, "asha", UserRole.student)
    kiran = make_user(db, "kiran", UserRole.student)
    priya = make_user(db, "priya", UserRole.student)
    for student in (rohan, asha, kiran):
        allocate(db, student, desai)
    allocate(db, priya, other)

    # rohan: open flag; asha: resolved only; kiran: in_discussion; priya: other mentor.
    raise_flags(db, rohan, semester, [(FlagRule.F1, "drop")])
    (asha_flag,) = raise_flags(db, asha, semester, [(FlagRule.F3, "low")])
    asha_flag.status = FlagStatus.resolved
    (kiran_flag,) = raise_flags(db, kiran, semester, [(FlagRule.F2, "fail")])
    kiran_flag.status = FlagStatus.in_discussion
    raise_flags(db, priya, semester, [(FlagRule.F3, "low")])
    db.commit()

    class World:
        pass

    w = World()
    w.ids = {u.name.lower(): u.id for u in (rohan, asha, kiran, priya)}
    w.desai = login_headers(client, desai.email)
    w.other = login_headers(client, other.email)
    w.rohan = login_headers(client, rohan.email)
    w.priya = login_headers(client, priya.email)
    return w


def create(client, headers, audience, **extra):
    payload = {
        "date_time": (utcnow() + timedelta(days=2)).isoformat(),
        "title": "Exam strategy",
        "audience": audience,
        **extra,
    }
    return client.post(f"{API}/mentor/group-sessions", json=payload, headers=headers)


def attendee_ids(body):
    return sorted(row["student"]["id"] for row in body["attendees"])


def test_audience_all_invites_every_active_mentee(client, world, db):
    response = create(client, world.desai, "all")
    assert response.status_code == 201, response.text
    body = response.json()
    ids = world.ids
    assert attendee_ids(body) == sorted([ids["rohan"], ids["asha"], ids["kiran"]])
    assert all(row["attended"] is None for row in body["attendees"])
    invites = db.scalars(
        select(Notification.user_id).where(Notification.type == notifications.GROUP_INVITE)
    ).all()
    assert sorted(invites) == attendee_ids(body)


def test_audience_flagged_is_resolved_server_side(client, world):
    response = create(client, world.desai, "flagged", student_ids=[world.ids["asha"]])
    assert response.status_code == 201
    # Unresolved flags only (open, in_discussion); asha's flag is resolved,
    # and the student_ids hint is ignored.
    assert attendee_ids(response.json()) == sorted([world.ids["rohan"], world.ids["kiran"]])


def test_audience_selected_requires_ids(client, world):
    assert create(client, world.desai, "selected").status_code == 422


def test_audience_selected_must_be_own_mentees(client, world):
    response = create(client, world.desai, "selected", student_ids=[world.ids["priya"]])
    assert response.status_code == 404

    ok = create(client, world.desai, "selected", student_ids=[world.ids["asha"]])
    assert ok.status_code == 201
    assert attendee_ids(ok.json()) == [world.ids["asha"]]


def test_empty_audience_400(client, world, db):
    lonely = make_user(db, "lonely", UserRole.mentor)
    response = create(client, login_headers(client, lonely.email), "all")
    assert response.status_code == 400


def test_past_session_400(client, world):
    payload = {
        "date_time": (utcnow() - timedelta(hours=1)).isoformat(),
        "title": "Late",
        "audience": "all",
    }
    response = client.post(f"{API}/mentor/group-sessions", json=payload, headers=world.desai)
    assert response.status_code == 400


def test_student_lists_and_views_only_invited_sessions(client, world):
    session = create(client, world.desai, "all").json()
    mine = client.get(f"{API}/students/me/group-sessions", headers=world.rohan)
    assert [s["id"] for s in mine.json()] == [session["id"]]
    assert client.get(f"{API}/students/me/group-sessions", headers=world.priya).json() == []

    assert client.get(f"{API}/group-sessions/{session['id']}", headers=world.rohan).status_code == 200
    assert client.get(f"{API}/group-sessions/{session['id']}", headers=world.priya).status_code == 404
    assert client.get(f"{API}/group-sessions/{session['id']}", headers=world.other).status_code == 404


def test_complete_records_attendance(client, world):
    session = create(client, world.desai, "all").json()
    response = client.post(
        f"{API}/mentor/group-sessions/{session['id']}/complete",
        json={
            "minutes": "Covered revision plans",
            "attendance": [{"student_id": world.ids["rohan"], "present": True}],
        },
        headers=world.desai,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "completed"
    attended = {row["student"]["id"]: row["attended"] for row in body["attendees"]}
    assert attended == {world.ids["rohan"]: True, world.ids["asha"]: False, world.ids["kiran"]: False}

    again = client.post(
        f"{API}/mentor/group-sessions/{session['id']}/complete",
        json={"minutes": "x"},
        headers=world.desai,
    )
    assert again.status_code == 409


def test_complete_rejects_uninvited_student(client, world):
    session = create(client, world.desai, "all").json()
    response = client.post(
        f"{API}/mentor/group-sessions/{session['id']}/complete",
        json={"minutes": "x", "attendance": [{"student_id": world.ids["priya"], "present": True}]},
        headers=world.desai,
    )
    assert response.status_code == 400


def test_cancel_notifies_all(client, world, db):
    session = create(client, world.desai, "all").json()
    assert (
        client.post(f"{API}/mentor/group-sessions/{session['id']}/cancel", headers=world.other).status_code
        == 404
    )
    response = client.post(f"{API}/mentor/group-sessions/{session['id']}/cancel", headers=world.desai)
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    cancelled = db.scalars(
        select(Notification.user_id).where(Notification.type == notifications.MEETING_CANCELLED)
    ).all()
    assert sorted(cancelled) == attendee_ids(session)


def test_mentor_lists_own_sessions_with_status_filter(client, world):
    first = create(client, world.desai, "all").json()
    create(client, world.desai, "flagged")
    client.post(f"{API}/mentor/group-sessions/{first['id']}/cancel", headers=world.desai)
    response = client.get(
        f"{API}/mentor/group-sessions", params={"status": "scheduled"}, headers=world.desai
    )
    assert len(response.json()) == 1
    assert client.get(f"{API}/mentor/group-sessions", headers=world.other).json() == []
