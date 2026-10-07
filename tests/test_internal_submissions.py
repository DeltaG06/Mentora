from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import AuditLog, Flag, InternalMark, InternalSubmission, Notification
from app.models.enums import (
    FlagRule,
    FlagStatus,
    SemesterStatus,
    SubmissionStatus,
    UserRole,
)
from app.services import notifications
from app.services.flag_engine import raise_flags
from tests.helpers import allocate, login_headers, make_semester, make_user

MINE = "/api/v1/students/me/internal-submissions"
QUEUE = "/api/v1/mentor/internal-submissions"


def subject(name="DSA", i1=12, i2=18, i3=8, max_per_test=20):
    return {"subject_name": name, "i1": i1, "i2": i2, "i3": i3, "max_per_test": max_per_test}


@pytest.fixture()
def world(client, db):
    class World:
        pass

    w = World()
    w.semester = make_semester(db, "Sem 1", date(2026, 1, 10))
    w.mentor_user = make_user(db, "desai", UserRole.mentor)
    w.student_user = make_user(db, "rohan", UserRole.student)
    w.other_mentor_user = make_user(db, "other", UserRole.mentor)
    allocate(db, w.student_user, w.mentor_user)
    w.student = login_headers(client, w.student_user.email)
    w.mentor = login_headers(client, w.mentor_user.email)
    w.other_mentor = login_headers(client, w.other_mentor_user.email)
    return w


def submit(client, world, subjects=None, semester_id=None):
    return client.post(
        MINE,
        json={
            "semester_id": semester_id or world.semester.id,
            "subjects": subjects if subjects is not None else [subject()],
        },
        headers=world.student,
    )


# --- submit -----------------------------------------------------------------


def test_submit_creates_pending_submission(client, world, db):
    response = submit(client, world, [subject(), subject("Maths", 15, None, None)])
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["student"] == {"id": world.student_user.id, "name": "Rohan", "roll_no": "ROHAN"}
    assert body["semester"] == {"id": world.semester.id, "label": "Sem 1"}
    assert body["subjects"] == [
        {"subject_name": "DSA", "i1": 12, "i2": 18, "i3": 8, "max_per_test": 20, "effective_internal": None},
        {"subject_name": "Maths", "i1": 15, "i2": None, "i3": None, "max_per_test": 20, "effective_internal": None},
    ]


def test_client_supplied_effective_internal_is_ignored(client, world, db):
    cheat = subject() | {"effective_internal": 20}
    response = submit(client, world, [cheat])
    assert response.status_code == 201
    assert response.json()["subjects"][0]["effective_internal"] is None
    assert db.scalar(select(InternalMark.effective_internal)) is None


@pytest.mark.parametrize(
    "subjects",
    [
        [],  # at least one subject
        [subject(i1=None, i2=None, i3=None)],  # at least one mark
        [subject(i1=21)],  # 21/20
        [subject(i3=21)],
        [subject(i1=-1)],
        [subject(max_per_test=0)],
        [subject("DSA"), subject("dsa")],  # duplicate subject
        [subject("   ")],
        [{"subject_name": "DSA", "i1": 10}],  # max_per_test missing
    ],
)
def test_submit_validation_is_422(client, world, db, subjects):
    assert submit(client, world, subjects).status_code == 422
    assert db.scalars(select(InternalSubmission)).all() == []


def test_mark_equal_to_max_is_allowed(client, world):
    assert submit(client, world, [subject(i1=20, i2=0, i3=None)]).status_code == 201


def test_closed_semester_is_400(client, world, db):
    closed = make_semester(db, "Closed", status=SemesterStatus.closed)
    response = submit(client, world, semester_id=closed.id)
    assert response.status_code == 400
    assert response.json()["detail"] == "semester closed"


def test_unknown_semester_is_404(client, world):
    assert submit(client, world, semester_id=9999).status_code == 404


def test_second_live_submission_is_409(client, world):
    assert submit(client, world).status_code == 201
    assert submit(client, world).status_code == 409  # pending blocks

    submission_id = client.get(MINE, headers=world.student).json()[0]["id"]
    client.post(f"{QUEUE}/{submission_id}/verify", headers=world.mentor)
    assert submit(client, world).status_code == 409  # verified blocks


def test_submit_requires_student_role(client, world):
    body = {"semester_id": world.semester.id, "subjects": [subject()]}
    assert client.post(MINE, json=body, headers=world.mentor).status_code == 403
    assert client.post(MINE, json=body).status_code == 401


# --- edit -------------------------------------------------------------------


def test_edit_pending_replaces_subjects(client, world, db):
    submission_id = submit(client, world).json()["id"]
    response = client.patch(
        f"{MINE}/{submission_id}",
        json={"subjects": [subject("DSA", 5, 5, 5), subject("OS", 19, None, None)]},
        headers=world.student,
    )
    assert response.status_code == 200
    assert [s["subject_name"] for s in response.json()["subjects"]] == ["DSA", "OS"]
    assert response.json()["subjects"][0]["i1"] == 5
    assert len(db.scalars(select(InternalMark)).all()) == 2


def test_edit_validates_marks(client, world):
    submission_id = submit(client, world).json()["id"]
    response = client.patch(
        f"{MINE}/{submission_id}", json={"subjects": [subject(i1=21)]}, headers=world.student
    )
    assert response.status_code == 422


def test_edit_verified_is_409_immutable(client, world):
    submission_id = submit(client, world).json()["id"]
    client.post(f"{QUEUE}/{submission_id}/verify", headers=world.mentor)

    response = client.patch(
        f"{MINE}/{submission_id}", json={"subjects": [subject(i1=20)]}, headers=world.student
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "verified records are immutable"


def test_edit_rejected_is_409(client, world):
    submission_id = submit(client, world).json()["id"]
    client.post(f"{QUEUE}/{submission_id}/reject", json={"note": "Blurry"}, headers=world.mentor)
    response = client.patch(
        f"{MINE}/{submission_id}", json={"subjects": [subject()]}, headers=world.student
    )
    assert response.status_code == 409


def test_edit_someone_elses_submission_is_404(client, world, db):
    submission_id = submit(client, world).json()["id"]
    other = make_user(db, "priya", UserRole.student)
    response = client.patch(
        f"{MINE}/{submission_id}",
        json={"subjects": [subject()]},
        headers=login_headers(client, other.email),
    )
    assert response.status_code == 404


# --- student list -----------------------------------------------------------


def test_student_list_shows_all_statuses_and_filters(client, world, db):
    sem2 = make_semester(db, "Sem 2", date(2026, 7, 15))
    first = submit(client, world).json()["id"]
    client.post(f"{QUEUE}/{first}/reject", json={"note": "Wrong marks"}, headers=world.mentor)
    second = submit(client, world).json()["id"]
    third = submit(client, world, semester_id=sem2.id).json()["id"]

    everything = client.get(MINE, headers=world.student).json()
    assert [s["id"] for s in everything] == [third, second, first]
    assert {s["status"] for s in everything} == {"pending", "rejected"}

    only_sem2 = client.get(MINE, params={"semester_id": sem2.id}, headers=world.student).json()
    assert [s["id"] for s in only_sem2] == [third]


# --- mentor queue and detail ------------------------------------------------


def test_queue_defaults_to_pending_for_own_mentees(client, world, db):
    stranger = make_user(db, "priya", UserRole.student)
    allocate(db, stranger, world.other_mentor_user)
    submission_id = submit(client, world).json()["id"]
    client.post(
        MINE,
        json={"semester_id": world.semester.id, "subjects": [subject()]},
        headers=login_headers(client, stranger.email),
    )

    queue = client.get(QUEUE, headers=world.mentor).json()
    assert [row["id"] for row in queue] == [submission_id]
    assert queue[0]["student"]["name"] == "Rohan"
    assert queue[0]["student"]["roll_no"] == "ROHAN"
    assert queue[0]["semester"]["label"] == "Sem 1"

    client.post(f"{QUEUE}/{submission_id}/verify", headers=world.mentor)
    assert client.get(QUEUE, headers=world.mentor).json() == []
    verified = client.get(QUEUE, params={"status": "verified"}, headers=world.mentor).json()
    assert [row["id"] for row in verified] == [submission_id]


def test_cross_mentor_detail_is_404(client, world):
    submission_id = submit(client, world).json()["id"]
    assert client.get(f"{QUEUE}/{submission_id}", headers=world.mentor).status_code == 200
    assert client.get(f"{QUEUE}/{submission_id}", headers=world.other_mentor).status_code == 404
    assert client.get(f"{QUEUE}/9999", headers=world.mentor).status_code == 404
    assert client.get(f"{QUEUE}/{submission_id}", headers=world.student).status_code == 403


# --- verify -----------------------------------------------------------------


def test_verify_persists_effective_15_for_12_18_8(client, world, db):
    submission_id = submit(client, world, [subject("DSA", 12, 18, 8, 20)]).json()["id"]

    response = client.post(f"{QUEUE}/{submission_id}/verify", headers=world.mentor)
    assert response.status_code == 200
    body = response.json()
    assert body["submission"]["status"] == "verified"
    assert body["submission"]["verified_by"] == world.mentor_user.id
    assert body["submission"]["verified_at"] is not None
    assert body["submission"]["subjects"][0]["effective_internal"] == 15
    assert body["flags_raised"] == []

    assert db.scalar(select(InternalMark.effective_internal)) == Decimal("15.00")

    entry = db.scalar(select(AuditLog).where(AuditLog.action == "internal_submission.verify"))
    assert entry.entity_id == submission_id and entry.actor_id == world.mentor_user.id


def test_submit_edit_verify_fires_f4_end_to_end(client, world, db):
    submission_id = submit(client, world, [subject("DSA", 16, 16, None)]).json()["id"]
    # The student corrects the marks downwards before verification.
    client.patch(
        f"{MINE}/{submission_id}",
        json={"subjects": [subject("DSA", 6, 6, None), subject("Maths", 18, 16, 12)]},
        headers=world.student,
    )

    response = client.post(f"{QUEUE}/{submission_id}/verify", headers=world.mentor)
    assert response.status_code == 200
    raised = response.json()["flags_raised"]
    assert len(raised) == 1
    assert raised[0]["rule"] == "F4"
    assert raised[0]["reason"] == "Subject 'DSA' internal 30.0% (below 40%)"
    assert raised[0]["status"] == "open"

    flag = db.scalar(select(Flag))
    assert flag.rule == FlagRule.F4
    assert flag.student_id == world.student_user.id
    assert flag.semester_id == world.semester.id
    assert flag.reason == "Subject 'DSA' internal 30.0% (below 40%)"
    assert flag.status == FlagStatus.open

    # Student and mentor were both told.
    recipients = db.scalars(
        select(Notification.user_id).where(Notification.type == notifications.FLAG_RAISED)
    ).all()
    assert set(recipients) == {world.student_user.id, world.mentor_user.id}


def test_verify_auto_resolves_open_f5(client, world, db):
    raise_flags(db, world.student_user, world.semester, [(FlagRule.F5, "deadline missed")])
    db.commit()
    submission_id = submit(client, world, [subject("DSA", 16, 16, None)]).json()["id"]

    client.post(f"{QUEUE}/{submission_id}/verify", headers=world.mentor)

    f5 = db.scalar(select(Flag).where(Flag.rule == FlagRule.F5))
    assert f5.status == FlagStatus.resolved
    assert f5.resolution_note == "Auto-resolved: late submission verified"
    assert f5.resolved_by == world.mentor_user.id


def test_verify_twice_is_409(client, world):
    submission_id = submit(client, world).json()["id"]
    assert client.post(f"{QUEUE}/{submission_id}/verify", headers=world.mentor).status_code == 200
    assert client.post(f"{QUEUE}/{submission_id}/verify", headers=world.mentor).status_code == 409
    assert (
        client.post(f"{QUEUE}/{submission_id}/reject", json={"note": "x"}, headers=world.mentor).status_code
        == 409
    )


def test_verify_by_other_mentor_is_404(client, world, db):
    submission_id = submit(client, world).json()["id"]
    assert (
        client.post(f"{QUEUE}/{submission_id}/verify", headers=world.other_mentor).status_code == 404
    )
    assert db.get(InternalSubmission, submission_id).status == SubmissionStatus.pending


# --- reject -----------------------------------------------------------------


@pytest.mark.parametrize("body", [{"note": ""}, {"note": "   "}, {}])
def test_reject_requires_note(client, world, db, body):
    submission_id = submit(client, world).json()["id"]
    response = client.post(f"{QUEUE}/{submission_id}/reject", json=body, headers=world.mentor)
    assert response.status_code == 422
    assert db.get(InternalSubmission, submission_id).status == SubmissionStatus.pending


def test_reject_saves_note_notifies_and_allows_reupload(client, world, db):
    first = submit(client, world).json()["id"]

    response = client.post(
        f"{QUEUE}/{first}/reject", json={"note": "I2 does not match the sheet"}, headers=world.mentor
    )
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert response.json()["rejection_note"] == "I2 does not match the sheet"

    note = db.scalar(
        select(Notification).where(Notification.type == notifications.SUBMISSION_REJECTED)
    )
    assert note.user_id == world.student_user.id
    assert "I2 does not match the sheet" in note.message

    # Rejected history does not block a re-upload, and it is retained.
    second = submit(client, world)
    assert second.status_code == 201
    rows = db.scalars(select(InternalSubmission).order_by(InternalSubmission.id)).all()
    assert [row.status for row in rows] == [SubmissionStatus.rejected, SubmissionStatus.pending]
    assert rows[0].id == first


def test_reject_by_other_mentor_is_404(client, world):
    submission_id = submit(client, world).json()["id"]
    response = client.post(
        f"{QUEUE}/{submission_id}/reject", json={"note": "x"}, headers=world.other_mentor
    )
    assert response.status_code == 404
