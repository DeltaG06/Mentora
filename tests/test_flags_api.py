from datetime import date

import pytest
from sqlalchemy import select

from app.models import AuditLog, Flag
from app.models.enums import FlagRule, FlagStatus, UserRole
from app.services.flag_engine import raise_flags
from tests.helpers import allocate, login_headers, make_semester, make_user

API = "/api/v1"


@pytest.fixture()
def world(client, db, admin_headers):
    """Two mentors with one mentee each, an unassigned student, and flags."""
    semester = make_semester(db, "Sem 1", date(2026, 1, 10))
    other_semester = make_semester(db, "Sem 2", date(2026, 7, 15))
    mentor_a = make_user(db, "mentora", UserRole.mentor)
    mentor_b = make_user(db, "mentorb", UserRole.mentor)
    rohan = make_user(db, "rohan", UserRole.student)
    priya = make_user(db, "priya", UserRole.student)
    loner = make_user(db, "loner", UserRole.student)
    allocate(db, rohan, mentor_a)
    allocate(db, priya, mentor_b)

    rohan_f1, rohan_f3 = raise_flags(
        db, rohan, semester, [(FlagRule.F1, "SGPA fell from 8.2 to 6.4"), (FlagRule.F3, "low")]
    )
    (rohan_f5,) = raise_flags(db, rohan, other_semester, [(FlagRule.F5, "deadline")])
    (priya_f2,) = raise_flags(db, priya, semester, [(FlagRule.F2, "Subject 'DSA' marks 32")])
    (loner_f3,) = raise_flags(db, loner, semester, [(FlagRule.F3, "low")])
    priya_f2.status = FlagStatus.escalated
    db.commit()

    class World:
        pass

    w = World()
    w.semester, w.other_semester = semester, other_semester
    w.rohan_flags = [rohan_f1.id, rohan_f3.id, rohan_f5.id]
    w.rohan_f1, w.priya_f2, w.loner_f3 = rohan_f1.id, priya_f2.id, loner_f3.id
    w.admin = admin_headers
    w.mentor_a = login_headers(client, mentor_a.email)
    w.mentor_b = login_headers(client, mentor_b.email)
    w.rohan = login_headers(client, rohan.email)
    w.priya = login_headers(client, priya.email)
    w.mentor_a_id = mentor_a.id
    return w


def ids(response):
    assert response.status_code == 200, response.text
    return [flag["id"] for flag in response.json()["items"]]


def resolve(client, headers, flag_id, note="Met the student and agreed a plan"):
    return client.post(
        f"{API}/flags/{flag_id}/resolve", json={"resolution_note": note}, headers=headers
    )


# --- lists ------------------------------------------------------------------


def test_student_sees_only_own_flags_newest_first(client, world):
    response = client.get(f"{API}/students/me/flags", headers=world.rohan)
    assert ids(response) == list(reversed(world.rohan_flags))
    body = response.json()
    assert body["total"] == 3 and body["page"] == 1 and body["page_size"] == 20

    flag = body["items"][-1]
    assert flag["rule"] == "F1"
    assert flag["reason"] == "SGPA fell from 8.2 to 6.4"
    assert flag["status"] == "open"


def test_student_flags_are_paginated(client, world):
    response = client.get(
        f"{API}/students/me/flags", params={"page": 2, "page_size": 2}, headers=world.rohan
    )
    assert ids(response) == [world.rohan_flags[0]]
    assert response.json()["total"] == 3


def test_mentor_sees_only_own_mentees_flags(client, world):
    response = client.get(f"{API}/mentor/flags", headers=world.mentor_a)
    assert sorted(ids(response)) == world.rohan_flags

    item = response.json()["items"][0]
    assert item["student"]["name"] == "Rohan"
    assert item["student"]["roll_no"] == "ROHAN"
    assert item["semester"]["label"] in {"Sem 1", "Sem 2"}

    assert ids(client.get(f"{API}/mentor/flags", headers=world.mentor_b)) == [world.priya_f2]


def test_mentor_flag_filters(client, world):
    def listing(**params):
        return ids(client.get(f"{API}/mentor/flags", params=params, headers=world.mentor_a))

    assert listing(rule="F1") == [world.rohan_f1]
    assert sorted(listing(status="open")) == world.rohan_flags
    assert listing(status="resolved") == []
    assert listing(semester_id=world.other_semester.id) == [world.rohan_flags[2]]
    assert (
        client.get(f"{API}/mentor/flags", params={"rule": "F9"}, headers=world.mentor_a).status_code
        == 422
    )


def test_mentor_loses_sight_after_reassignment(client, world, db):
    from app.models import Allocation
    from app.models.enums import AllocationStatus

    allocation = db.scalar(select(Allocation).where(Allocation.mentor_id == world.mentor_a_id))
    allocation.status = AllocationStatus.ended
    db.commit()

    assert ids(client.get(f"{API}/mentor/flags", headers=world.mentor_a)) == []
    assert client.get(f"{API}/flags/{world.rohan_f1}", headers=world.mentor_a).status_code == 404


def test_admin_sees_all_and_can_filter_escalated(client, world):
    assert len(ids(client.get(f"{API}/admin/flags", headers=world.admin))) == 5
    escalated = client.get(
        f"{API}/admin/flags", params={"escalated": "true"}, headers=world.admin
    )
    assert ids(escalated) == [world.priya_f2]
    assert (
        len(ids(client.get(f"{API}/admin/flags", params={"rule": "F3"}, headers=world.admin)))
        == 2
    )


def test_list_endpoints_enforce_roles(client, world):
    assert client.get(f"{API}/admin/flags", headers=world.mentor_a).status_code == 403
    assert client.get(f"{API}/admin/flags", headers=world.rohan).status_code == 403
    assert client.get(f"{API}/mentor/flags", headers=world.rohan).status_code == 403
    assert client.get(f"{API}/students/me/flags", headers=world.mentor_a).status_code == 403
    assert client.get(f"{API}/students/me/flags").status_code == 401


# --- detail -----------------------------------------------------------------


def test_detail_scoping(client, world):
    def detail(flag_id, headers):
        return client.get(f"{API}/flags/{flag_id}", headers=headers).status_code

    # Own flag / own mentee / admin.
    assert detail(world.rohan_f1, world.rohan) == 200
    assert detail(world.rohan_f1, world.mentor_a) == 200
    assert detail(world.rohan_f1, world.admin) == 200
    assert detail(world.loner_f3, world.admin) == 200

    # Everyone else gets 404, never 403.
    assert detail(world.rohan_f1, world.priya) == 404
    assert detail(world.rohan_f1, world.mentor_b) == 404
    assert detail(world.loner_f3, world.mentor_a) == 404
    assert detail(9999, world.admin) == 404


# --- resolve ----------------------------------------------------------------


def test_mentor_resolves_own_mentees_flag(client, world, db):
    response = resolve(client, world.mentor_a, world.rohan_f1)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "resolved"
    assert body["resolution_note"] == "Met the student and agreed a plan"
    assert body["resolved_by"] == world.mentor_a_id
    assert body["resolved_at"] is not None

    entry = db.scalar(select(AuditLog).where(AuditLog.action == "flag.resolve"))
    assert entry.entity == "flag" and entry.entity_id == world.rohan_f1
    assert entry.actor_id == world.mentor_a_id


@pytest.mark.parametrize("body", [{"resolution_note": ""}, {"resolution_note": "   "}, {}])
def test_resolve_empty_note_is_422(client, world, db, body):
    response = client.post(
        f"{API}/flags/{world.rohan_f1}/resolve", json=body, headers=world.mentor_a
    )
    assert response.status_code == 422
    assert db.get(Flag, world.rohan_f1).status == FlagStatus.open
    assert db.scalar(select(AuditLog).where(AuditLog.action == "flag.resolve")) is None


def test_double_resolve_is_409(client, world):
    assert resolve(client, world.mentor_a, world.rohan_f1).status_code == 200
    assert resolve(client, world.mentor_a, world.rohan_f1).status_code == 409


def test_mentor_cannot_resolve_other_mentors_flag(client, world, db):
    assert resolve(client, world.mentor_a, world.priya_f2).status_code == 404
    assert db.get(Flag, world.priya_f2).status == FlagStatus.escalated


def test_student_cannot_resolve(client, world):
    assert resolve(client, world.rohan, world.rohan_f1).status_code == 403


def test_admin_resolves_anything(client, world):
    # Another mentor's escalated flag, and an unassigned student's flag.
    assert resolve(client, world.admin, world.priya_f2, "Force-resolved").status_code == 200
    assert resolve(client, world.admin, world.loner_f3, "Force-resolved").status_code == 200
    assert resolve(client, world.admin, 9999).status_code == 404
