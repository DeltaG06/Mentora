from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import AuditLog, Flag, Meeting, MeetingFlag, Notification, Slot, User
from app.models.enums import FlagRule, FlagStatus, SlotStatus, UserRole
from app.models.types import utcnow
from app.services import notifications
from app.services.flag_engine import raise_flags
from tests.helpers import allocate, login_headers, make_semester, make_user

API = "/api/v1"


def iso(delta: timedelta) -> str:
    return (utcnow() + delta).isoformat()


@pytest.fixture()
def world(client, db):
    semester = make_semester(db, "Sem 1", date(2026, 1, 10))
    desai = make_user(db, "desai", UserRole.mentor)
    other = make_user(db, "other", UserRole.mentor)
    rohan = make_user(db, "rohan", UserRole.student)
    priya = make_user(db, "priya", UserRole.student)
    loner = make_user(db, "loner", UserRole.student)
    allocate(db, rohan, desai)
    allocate(db, priya, other)

    class World:
        pass

    w = World()
    w.semester = semester
    w.desai_id, w.rohan_id, w.priya_id, w.loner_id = desai.id, rohan.id, priya.id, loner.id
    w.desai = login_headers(client, desai.email)
    w.other = login_headers(client, other.email)
    w.rohan = login_headers(client, rohan.email)
    w.priya = login_headers(client, priya.email)
    w.loner = login_headers(client, loner.email)
    return w


def publish(client, headers, delta=timedelta(days=2), **extra):
    response = client.post(
        f"{API}/mentor/slots", json={"date_time": iso(delta), **extra}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def book(client, headers, slot_id, agenda="Discuss my SGPA"):
    return client.post(f"{API}/slots/{slot_id}/book", json={"agenda": agenda}, headers=headers)


# --- slots ------------------------------------------------------------------


def test_publish_slot_defaults_to_30_minutes(client, world):
    slot = publish(client, world.desai)
    assert slot["status"] == "open" and slot["meeting"] is None
    duration = datetime.fromisoformat(slot["end_time"]) - datetime.fromisoformat(
        slot["start_time"]
    )
    assert duration == timedelta(minutes=30)


def test_slot_in_past_is_rejected(client, world):
    response = client.post(
        f"{API}/mentor/slots", json={"date_time": iso(-timedelta(hours=1))}, headers=world.desai
    )
    assert response.status_code == 400


def test_naive_datetime_is_rejected(client, world):
    response = client.post(
        f"{API}/mentor/slots", json={"date_time": "2030-01-01T10:00:00"}, headers=world.desai
    )
    assert response.status_code == 422


def test_students_cannot_publish_slots(client, world):
    response = client.post(
        f"{API}/mentor/slots", json={"date_time": iso(timedelta(days=1))}, headers=world.rohan
    )
    assert response.status_code == 403


def test_list_slots_filters_by_status(client, world):
    first = publish(client, world.desai)
    publish(client, world.desai, timedelta(days=3))
    book(client, world.rohan, first["id"])

    response = client.get(f"{API}/mentor/slots", params={"status": "open"}, headers=world.desai)
    assert response.status_code == 200
    assert len(response.json()) == 1

    booked = client.get(f"{API}/mentor/slots", params={"status": "booked"}, headers=world.desai)
    assert booked.json()[0]["meeting"]["student"]["id"] == world.rohan_id


def test_student_sees_only_own_mentors_open_future_slots(client, world, db):
    publish(client, world.desai)
    publish(client, world.other)
    response = client.get(f"{API}/students/me/mentor/slots", headers=world.rohan)
    assert response.status_code == 200
    assert len(response.json()) == 1

    assert client.get(f"{API}/students/me/mentor/slots", headers=world.loner).status_code == 404


def test_cancel_open_slot(client, world):
    slot = publish(client, world.desai)
    response = client.patch(f"{API}/mentor/slots/{slot['id']}/cancel", headers=world.desai)
    assert response.status_code == 200 and response.json()["status"] == "cancelled"

    again = client.patch(f"{API}/mentor/slots/{slot['id']}/cancel", headers=world.desai)
    assert again.status_code == 409


def test_cancel_booked_slot_cancels_meeting_and_notifies(client, world, db):
    slot = publish(client, world.desai)
    meeting = book(client, world.rohan, slot["id"]).json()

    response = client.patch(f"{API}/mentor/slots/{slot['id']}/cancel", headers=world.desai)
    assert response.status_code == 200

    stored = db.get(Meeting, meeting["id"])
    assert stored.status.value == "cancelled"
    assert db.scalar(
        select(Notification).where(
            Notification.user_id == world.rohan_id,
            Notification.type == notifications.MEETING_CANCELLED,
        )
    )


def test_other_mentor_cannot_cancel_slot(client, world):
    slot = publish(client, world.desai)
    response = client.patch(f"{API}/mentor/slots/{slot['id']}/cancel", headers=world.other)
    assert response.status_code == 404


# --- booking ----------------------------------------------------------------


def test_full_booking_lifecycle(client, world, db):
    slot = publish(client, world.desai)
    response = book(client, world.rohan, slot["id"])
    assert response.status_code == 201, response.text
    meeting = response.json()
    assert meeting["status"] == "scheduled"
    assert meeting["slot"]["status"] == "booked"
    assert meeting["slot"]["mentor"]["id"] == world.desai_id
    assert meeting["invited_by_mentor"] is False

    types = db.scalars(
        select(Notification.user_id).where(Notification.type == notifications.MEETING_BOOKED)
    ).all()
    assert sorted(types) == sorted([world.rohan_id, world.desai_id])

    # Both parties see it; others get 404.
    for headers in (world.rohan, world.desai):
        detail = client.get(f"{API}/meetings/{meeting['id']}", headers=headers)
        assert detail.status_code == 200
    for headers in (world.priya, world.other):
        assert client.get(f"{API}/meetings/{meeting['id']}", headers=headers).status_code == 404

    mine = client.get(f"{API}/students/me/meetings", params={"upcoming": True}, headers=world.rohan)
    assert [m["id"] for m in mine.json()] == [meeting["id"]]
    past = client.get(f"{API}/students/me/meetings", params={"upcoming": False}, headers=world.rohan)
    assert past.json() == []

    completed = client.post(
        f"{API}/meetings/{meeting['id']}/complete",
        json={"minutes": "Agreed a study plan"},
        headers=world.desai,
    )
    assert completed.status_code == 200, completed.text
    body = completed.json()
    assert body["meeting"]["status"] == "completed"
    assert body["meeting"]["completed_at"] is not None
    assert body["meeting"]["slot"]["status"] == "completed"
    assert body["flags_moved"] == []


def test_book_already_booked_slot_409(client, world, db):
    rohan2 = make_user(db, "rohan2", UserRole.student)
    allocate(db, rohan2, db.get(User, world.desai_id))
    slot = publish(client, world.desai)
    assert book(client, world.rohan, slot["id"]).status_code == 201
    second = book(client, login_headers(client, rohan2.email), slot["id"])
    assert second.status_code == 409


def test_cannot_book_another_mentors_slot(client, world):
    slot = publish(client, world.other)
    assert book(client, world.rohan, slot["id"]).status_code == 404


def test_book_requires_agenda(client, world):
    slot = publish(client, world.desai)
    assert book(client, world.rohan, slot["id"], agenda="   ").status_code == 422


def test_book_started_slot_400(client, world, db):
    slot = publish(client, world.desai)
    stored = db.get(Slot, slot["id"])
    stored.start_time = utcnow() - timedelta(minutes=5)
    db.commit()
    assert book(client, world.rohan, slot["id"]).status_code == 400


# --- invitations ------------------------------------------------------------


def test_mentor_invites_mentee(client, world, db):
    slot = publish(client, world.desai)
    response = client.post(
        f"{API}/mentor/slots/{slot['id']}/invite",
        json={"student_id": world.rohan_id},
        headers=world.desai,
    )
    assert response.status_code == 201, response.text
    meeting = response.json()
    assert meeting["invited_by_mentor"] is True
    assert meeting["agenda"] == "Mentor-initiated guidance meeting"
    assert db.scalar(
        select(Notification).where(
            Notification.user_id == world.rohan_id,
            Notification.type == notifications.MEETING_BOOKED,
        )
    )


def test_invite_on_booked_slot_409(client, world):
    slot = publish(client, world.desai)
    book(client, world.rohan, slot["id"])
    response = client.post(
        f"{API}/mentor/slots/{slot['id']}/invite",
        json={"student_id": world.rohan_id},
        headers=world.desai,
    )
    assert response.status_code == 409


def test_invite_non_mentee_404(client, world):
    slot = publish(client, world.desai)
    response = client.post(
        f"{API}/mentor/slots/{slot['id']}/invite",
        json={"student_id": world.priya_id},
        headers=world.desai,
    )
    assert response.status_code == 404


def test_invite_on_other_mentors_slot_404(client, world):
    slot = publish(client, world.other)
    response = client.post(
        f"{API}/mentor/slots/{slot['id']}/invite",
        json={"student_id": world.rohan_id},
        headers=world.desai,
    )
    assert response.status_code == 404


# --- cancellation -----------------------------------------------------------


def test_student_cancels_early_and_slot_reverts(client, world, db):
    slot = publish(client, world.desai)
    meeting = book(client, world.rohan, slot["id"]).json()

    response = client.post(f"{API}/meetings/{meeting['id']}/cancel", headers=world.rohan)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert db.get(Slot, slot["id"]).status == SlotStatus.open
    assert db.scalar(
        select(Notification).where(
            Notification.user_id == world.desai_id,
            Notification.type == notifications.MEETING_CANCELLED,
        )
    )

    # The reopened slot can be booked again (the partial index allows it).
    assert book(client, world.rohan, slot["id"]).status_code == 201


def test_student_cannot_cancel_inside_two_hours(client, world, db):
    slot = publish(client, world.desai, timedelta(hours=1, minutes=30))
    meeting = book(client, world.rohan, slot["id"]).json()

    response = client.post(f"{API}/meetings/{meeting['id']}/cancel", headers=world.rohan)
    assert response.status_code == 400
    assert db.get(Slot, slot["id"]).status == SlotStatus.booked


def test_mentor_can_cancel_inside_two_hours(client, world, db):
    slot = publish(client, world.desai, timedelta(minutes=30))
    meeting = book(client, world.rohan, slot["id"]).json()

    response = client.post(f"{API}/meetings/{meeting['id']}/cancel", headers=world.desai)
    assert response.status_code == 200
    assert db.get(Slot, slot["id"]).status == SlotStatus.open


def test_cannot_cancel_completed_meeting(client, world):
    slot = publish(client, world.desai)
    meeting = book(client, world.rohan, slot["id"]).json()
    client.post(
        f"{API}/meetings/{meeting['id']}/complete", json={"minutes": "done"}, headers=world.desai
    )
    response = client.post(f"{API}/meetings/{meeting['id']}/cancel", headers=world.desai)
    assert response.status_code == 409


def test_outsider_cannot_cancel(client, world):
    slot = publish(client, world.desai)
    meeting = book(client, world.rohan, slot["id"]).json()
    assert client.post(f"{API}/meetings/{meeting['id']}/cancel", headers=world.other).status_code == 404
    assert client.post(f"{API}/meetings/{meeting['id']}/cancel", headers=world.priya).status_code == 404


# --- completion and flag linkage --------------------------------------------


def test_complete_moves_linked_open_flags_to_in_discussion(client, world, db):
    rohan = db.get(User, world.rohan_id)
    f1, f3 = raise_flags(db, rohan, world.semester, [(FlagRule.F1, "drop"), (FlagRule.F3, "low")])
    f3.status = FlagStatus.escalated
    db.commit()

    slot = publish(client, world.desai, timedelta(days=3))
    meeting = book(client, world.rohan, slot["id"]).json()
    response = client.post(
        f"{API}/meetings/{meeting['id']}/complete",
        json={"minutes": "Discussed the drop", "linked_flag_ids": [f1.id, f3.id]},
        headers=world.desai,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert [flag["id"] for flag in body["flags_moved"]] == [f1.id]
    assert body["flags_moved"][0]["status"] == "in_discussion"
    assert {flag["id"] for flag in body["meeting"]["linked_flags"]} == {f1.id, f3.id}

    db.expire_all()
    assert db.get(Flag, f3.id).status == FlagStatus.escalated
    links = db.scalars(select(MeetingFlag.flag_id).where(MeetingFlag.meeting_id == meeting["id"])).all()
    assert sorted(links) == sorted([f1.id, f3.id])
    assert db.scalar(select(AuditLog).where(AuditLog.action == "meeting.complete"))


def test_complete_rejects_other_students_flag(client, world, db):
    priya = db.get(User, world.priya_id)
    (flag,) = raise_flags(db, priya, world.semester, [(FlagRule.F3, "low")])
    db.commit()

    slot = publish(client, world.desai, timedelta(days=3))
    meeting = book(client, world.rohan, slot["id"]).json()
    response = client.post(
        f"{API}/meetings/{meeting['id']}/complete",
        json={"minutes": "x", "linked_flag_ids": [flag.id]},
        headers=world.desai,
    )
    assert response.status_code == 400


def test_complete_requires_minutes_and_mentor(client, world):
    slot = publish(client, world.desai)
    meeting = book(client, world.rohan, slot["id"]).json()
    url = f"{API}/meetings/{meeting['id']}/complete"
    assert client.post(url, json={"minutes": " "}, headers=world.desai).status_code == 422
    assert client.post(url, json={"minutes": "x"}, headers=world.rohan).status_code == 403
    assert client.post(url, json={"minutes": "x"}, headers=world.other).status_code == 404
    assert client.post(url, json={"minutes": "x"}, headers=world.desai).status_code == 200
    assert client.post(url, json={"minutes": "x"}, headers=world.desai).status_code == 409
