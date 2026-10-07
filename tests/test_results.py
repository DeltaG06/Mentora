import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import AuditLog, Flag, Notification, SemesterResult
from app.models.enums import (
    FlagRule,
    FlagStatus,
    SemesterStatus,
    SubmissionStatus,
    UserRole,
)
from app.services import flag_engine, notifications, proof_storage
from tests.helpers import allocate, login_headers, make_result, make_semester, make_user

MINE = "/api/v1/students/me/results"
QUEUE = "/api/v1/mentor/results"
ADMIN = "/api/v1/admin/results"

FIXTURES = Path(__file__).parent / "fixtures"
PDF = (FIXTURES / "proof.pdf").read_bytes()
TXT = (FIXTURES / "notes.txt").read_bytes()
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 32

PDF_FILE = ("proof.pdf", PDF, "application/pdf")
GOOD_SUBJECTS = [{"subject_name": "DSA", "final_marks": 72}, {"subject_name": "Maths", "final_marks": 65, "max_marks": 100}]


@pytest.fixture()
def world(client, db, admin_headers):
    class World:
        pass

    w = World()
    w.sem1 = make_semester(db, "Sem 1", date(2026, 1, 10))
    w.sem2 = make_semester(db, "Sem 2", date(2026, 7, 15))
    w.mentor_user = make_user(db, "desai", UserRole.mentor)
    w.student_user = make_user(db, "rohan", UserRole.student)
    w.other_mentor_user = make_user(db, "other", UserRole.mentor)
    allocate(db, w.student_user, w.mentor_user)
    w.student = login_headers(client, w.student_user.email)
    w.mentor = login_headers(client, w.mentor_user.email)
    w.other_mentor = login_headers(client, w.other_mentor_user.email)
    w.admin = admin_headers
    return w


def upload(client, world, *, sgpa="8.2", subjects=GOOD_SUBJECTS, file=PDF_FILE, semester=None):
    return client.post(
        MINE,
        data={
            "semester_id": (semester or world.sem2).id,
            "sgpa": sgpa,
            "subjects": subjects if isinstance(subjects, str) else json.dumps(subjects),
        },
        files={"proof_file": file},
        headers=world.student,
    )


def stored_files(upload_dir):
    proofs = upload_dir / "proofs"
    return sorted(p.name for p in proofs.iterdir()) if proofs.exists() else []


def verify(client, world, result_id):
    return client.post(f"{QUEUE}/{result_id}/verify", headers=world.mentor)


# --- upload -----------------------------------------------------------------


def test_valid_upload_is_201_and_stores_file(client, world, db, upload_dir):
    response = upload(client, world)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["sgpa"] == 8.2
    assert body["semester"] == {"id": world.sem2.id, "label": "Sem 2"}
    assert body["subjects"] == [
        {"subject_name": "DSA", "final_marks": 72, "max_marks": 100},  # default max
        {"subject_name": "Maths", "final_marks": 65, "max_marks": 100},
    ]
    # The stored path is never exposed.
    assert "proof_url" not in body and "proof" not in json.dumps(body)

    result = db.scalar(select(SemesterResult))
    assert result.sgpa == Decimal("8.20")
    assert result.proof_url.startswith("proofs/") and result.proof_url.endswith(".pdf")
    assert (upload_dir / result.proof_url).read_bytes() == PDF
    assert stored_files(upload_dir) == [Path(result.proof_url).name]


@pytest.mark.parametrize(
    "file",
    [("scan.png", PNG, "image/png"), ("scan.jpg", JPG, "image/jpeg"), ("SCAN.JPEG", JPG, "image/jpeg")],
)
def test_images_are_accepted(client, world, file):
    assert upload(client, world, file=file).status_code == 201


@pytest.mark.parametrize(
    "file",
    [
        ("notes.txt", TXT, "text/plain"),
        ("notes.pdf", TXT, "application/pdf"),  # text renamed to .pdf
        ("proof.exe", PDF, "application/pdf"),
        ("proof", PDF, "application/pdf"),
    ],
)
def test_wrong_file_type_is_422(client, world, db, upload_dir, file):
    assert upload(client, world, file=file).status_code == 422
    assert stored_files(upload_dir) == []
    assert db.scalars(select(SemesterResult)).all() == []


def test_6mb_file_is_413(client, world, db, upload_dir):
    big = ("big.pdf", b"%PDF-" + b"0" * (6 * 1024 * 1024), "application/pdf")
    assert upload(client, world, file=big).status_code == 413
    assert stored_files(upload_dir) == []
    assert db.scalars(select(SemesterResult)).all() == []


def test_exactly_5mb_is_accepted(client, world):
    exact = ("ok.pdf", b"%PDF-" + b"0" * (proof_storage.MAX_PROOF_BYTES - 5), "application/pdf")
    assert upload(client, world, file=exact).status_code == 201


@pytest.mark.parametrize("sgpa", ["10.01", "-0.1", "abc", "8.123"])
def test_invalid_sgpa_is_422(client, world, sgpa):
    assert upload(client, world, sgpa=sgpa).status_code == 422


@pytest.mark.parametrize("sgpa", ["0", "10", "10.00", "6.4"])
def test_sgpa_bounds_are_inclusive(client, world, sgpa):
    assert upload(client, world, sgpa=sgpa).status_code == 201


@pytest.mark.parametrize(
    "subjects",
    [
        "not json",
        [],
        [{"subject_name": "DSA", "final_marks": 101}],  # above default max 100
        [{"subject_name": "DSA", "final_marks": 51, "max_marks": 50}],
        [{"subject_name": "DSA", "final_marks": -1}],
        [{"subject_name": "DSA"}],
        [{"subject_name": "DSA", "final_marks": 50}, {"subject_name": "dsa", "final_marks": 60}],
        {"subject_name": "DSA", "final_marks": 50},  # object, not array
    ],
)
def test_invalid_subjects_are_422(client, world, upload_dir, subjects):
    assert upload(client, world, subjects=subjects).status_code == 422
    assert stored_files(upload_dir) == []


def test_missing_proof_file_is_422(client, world):
    response = client.post(
        MINE,
        data={"semester_id": world.sem2.id, "sgpa": "8.2", "subjects": json.dumps(GOOD_SUBJECTS)},
        headers=world.student,
    )
    assert response.status_code == 422


def test_closed_or_unknown_semester(client, world, db, upload_dir):
    closed = make_semester(db, "Closed", status=SemesterStatus.closed)
    response = upload(client, world, semester=closed)
    assert response.status_code == 400
    assert response.json()["detail"] == "semester closed"

    world.sem2.id = 9999
    assert upload(client, world).status_code == 404
    assert stored_files(upload_dir) == []


def test_second_live_result_is_409(client, world, upload_dir):
    assert upload(client, world).status_code == 201
    assert upload(client, world).status_code == 409
    assert len(stored_files(upload_dir)) == 1  # the rejected upload left no file


def test_upload_requires_student_role(client, world):
    response = client.post(
        MINE,
        data={"semester_id": world.sem2.id, "sgpa": "8", "subjects": json.dumps(GOOD_SUBJECTS)},
        files={"proof_file": PDF_FILE},
        headers=world.mentor,
    )
    assert response.status_code == 403


# --- edit -------------------------------------------------------------------


def test_edit_pending_fields(client, world, db):
    result_id = upload(client, world).json()["id"]
    response = client.patch(
        f"{MINE}/{result_id}",
        data={"sgpa": "7.5", "subjects": json.dumps([{"subject_name": "OS", "final_marks": 55}])},
        headers=world.student,
    )
    assert response.status_code == 200
    assert response.json()["sgpa"] == 7.5
    assert response.json()["subjects"] == [
        {"subject_name": "OS", "final_marks": 55, "max_marks": 100}
    ]


def test_edit_replaces_proof_and_deletes_old_file(client, world, db, upload_dir):
    result_id = upload(client, world).json()["id"]
    old_name = stored_files(upload_dir)[0]

    response = client.patch(
        f"{MINE}/{result_id}",
        files={"proof_file": ("new.png", PNG, "image/png")},
        headers=world.student,
    )
    assert response.status_code == 200

    files = stored_files(upload_dir)
    assert len(files) == 1 and files[0] != old_name and files[0].endswith(".png")
    db.expire_all()
    assert db.get(SemesterResult, result_id).proof_url == f"proofs/{files[0]}"
    assert response.json()["sgpa"] == 8.2  # untouched


def test_edit_with_bad_file_keeps_old_proof(client, world, upload_dir):
    result_id = upload(client, world).json()["id"]
    before = stored_files(upload_dir)
    response = client.patch(
        f"{MINE}/{result_id}",
        files={"proof_file": ("notes.txt", TXT, "text/plain")},
        headers=world.student,
    )
    assert response.status_code == 422
    assert stored_files(upload_dir) == before


def test_edit_verified_is_409_immutable(client, world):
    result_id = upload(client, world).json()["id"]
    verify(client, world, result_id)
    response = client.patch(f"{MINE}/{result_id}", data={"sgpa": "9.9"}, headers=world.student)
    assert response.status_code == 409
    assert response.json()["detail"] == "verified records are immutable"


def test_edit_rejected_is_409_and_others_is_404(client, world, db):
    result_id = upload(client, world).json()["id"]
    other = make_user(db, "priya", UserRole.student)
    assert (
        client.patch(
            f"{MINE}/{result_id}", data={"sgpa": "9"}, headers=login_headers(client, other.email)
        ).status_code
        == 404
    )
    client.post(f"{QUEUE}/{result_id}/reject", json={"note": "Blurry"}, headers=world.mentor)
    assert (
        client.patch(f"{MINE}/{result_id}", data={"sgpa": "9"}, headers=world.student).status_code
        == 409
    )


# --- lists and scoping ------------------------------------------------------


def test_student_list_with_semester_filter(client, world):
    first = upload(client, world, semester=world.sem1).json()["id"]
    second = upload(client, world, semester=world.sem2).json()["id"]

    assert [r["id"] for r in client.get(MINE, headers=world.student).json()] == [second, first]
    filtered = client.get(MINE, params={"semester_id": world.sem1.id}, headers=world.student)
    assert [r["id"] for r in filtered.json()] == [first]


def test_mentor_queue_and_detail_are_mentee_scoped(client, world):
    result_id = upload(client, world).json()["id"]

    queue = client.get(QUEUE, headers=world.mentor).json()
    assert [r["id"] for r in queue] == [result_id]
    assert queue[0]["student"]["roll_no"] == "ROHAN"
    assert client.get(QUEUE, headers=world.other_mentor).json() == []

    assert client.get(f"{QUEUE}/{result_id}", headers=world.mentor).status_code == 200
    assert client.get(f"{QUEUE}/{result_id}", headers=world.other_mentor).status_code == 404

    verify(client, world, result_id)
    assert client.get(QUEUE, headers=world.mentor).json() == []
    verified = client.get(QUEUE, params={"status": "verified"}, headers=world.mentor).json()
    assert [r["id"] for r in verified] == [result_id]


# --- proof access -----------------------------------------------------------


def test_proof_access(client, world):
    result_id = upload(client, world).json()["id"]

    assigned = client.get(f"{QUEUE}/{result_id}/proof", headers=world.mentor)
    assert assigned.status_code == 200
    assert assigned.headers["content-type"] == "application/pdf"
    assert assigned.content == PDF

    admin = client.get(f"{ADMIN}/{result_id}/proof", headers=world.admin)
    assert admin.status_code == 200 and admin.content == PDF

    # Everyone else gets 404.
    assert client.get(f"{QUEUE}/{result_id}/proof", headers=world.other_mentor).status_code == 404
    assert client.get(f"{QUEUE}/{result_id}/proof", headers=world.student).status_code == 404
    assert client.get(f"{QUEUE}/{result_id}/proof", headers=world.admin).status_code == 404
    assert client.get(f"{ADMIN}/{result_id}/proof", headers=world.mentor).status_code == 404
    assert client.get(f"{ADMIN}/{result_id}/proof", headers=world.student).status_code == 404
    assert client.get(f"{ADMIN}/9999/proof", headers=world.admin).status_code == 404
    assert client.get(f"{QUEUE}/{result_id}/proof").status_code == 401


def test_proof_content_type_follows_the_file(client, world):
    result_id = upload(client, world, file=("scan.png", PNG, "image/png")).json()["id"]
    response = client.get(f"{QUEUE}/{result_id}/proof", headers=world.mentor)
    assert response.headers["content-type"] == "image/png"


def test_uploads_are_not_served_statically(client, world, db):
    upload(client, world)
    path = db.scalar(select(SemesterResult.proof_url))
    assert client.get(f"/uploads/{path}", headers=world.admin).status_code == 404
    assert client.get(f"/{path}", headers=world.admin).status_code == 404


# --- verify -> flag engine --------------------------------------------------


def test_verify_sgpa_drop_raises_f1(client, world, db):
    make_result(db, world.student_user, world.sem1, 8.2)
    result_id = upload(client, world, sgpa="6.4").json()["id"]

    response = verify(client, world, result_id)
    assert response.status_code == 200
    body = response.json()
    assert body["result"]["status"] == "verified"
    assert body["result"]["verified_by"] == world.mentor_user.id
    assert [(f["rule"], f["reason"]) for f in body["flags_raised"]] == [
        ("F1", "SGPA fell from 8.2 to 6.4")
    ]

    flag = db.scalar(select(Flag))
    assert flag.rule == FlagRule.F1 and flag.reason == "SGPA fell from 8.2 to 6.4"
    assert flag.semester_id == world.sem2.id and flag.status == FlagStatus.open

    entry = db.scalar(select(AuditLog).where(AuditLog.action == "semester_result.verify"))
    assert entry.entity_id == result_id and entry.actor_id == world.mentor_user.id


def test_verify_failed_subject_raises_f2(client, world, db):
    subjects = [{"subject_name": "DSA", "final_marks": 32, "max_marks": 100}]
    result_id = upload(client, world, sgpa="7.0", subjects=subjects).json()["id"]

    raised = verify(client, world, result_id).json()["flags_raised"]
    assert [(f["rule"], f["reason"]) for f in raised] == [
        ("F2", "Subject 'DSA' marks 32 (below 40)")
    ]


def test_verify_low_sgpa_raises_f3(client, world, db):
    result_id = upload(client, world, sgpa="5.9").json()["id"]
    raised = verify(client, world, result_id).json()["flags_raised"]
    assert [(f["rule"], f["reason"]) for f in raised] == [("F3", "SGPA 5.9 (below 6.0)")]


def test_verify_healthy_result_raises_nothing(client, world, db):
    result_id = upload(client, world).json()["id"]
    assert verify(client, world, result_id).json()["flags_raised"] == []
    assert db.scalars(select(Flag)).all() == []


def test_late_upload_auto_resolves_open_f5(client, world, db):
    now = datetime.now(timezone.utc)
    world.sem2.result_deadline = now - timedelta(days=2)
    db.commit()
    flag_engine.run_deadline_scan(db, now)
    db.commit()
    f5 = db.scalar(select(Flag).where(Flag.student_id == world.student_user.id))
    assert f5.rule == FlagRule.F5 and f5.status == FlagStatus.open

    result_id = upload(client, world).json()["id"]  # late, but the semester is open
    assert verify(client, world, result_id).status_code == 200

    db.expire_all()
    f5 = db.get(Flag, f5.id)
    assert f5.status == FlagStatus.resolved
    assert f5.resolution_note == "Auto-resolved: late submission verified"
    assert f5.resolved_by == world.mentor_user.id


def test_verify_conflicts_and_scoping(client, world, db):
    result_id = upload(client, world).json()["id"]
    assert client.post(f"{QUEUE}/{result_id}/verify", headers=world.other_mentor).status_code == 404
    assert verify(client, world, result_id).status_code == 200
    assert verify(client, world, result_id).status_code == 409
    assert (
        client.post(f"{QUEUE}/{result_id}/reject", json={"note": "x"}, headers=world.mentor).status_code
        == 409
    )


# --- reject -----------------------------------------------------------------


@pytest.mark.parametrize("body", [{"note": ""}, {"note": "  "}, {}])
def test_reject_requires_note(client, world, db, body):
    result_id = upload(client, world).json()["id"]
    response = client.post(f"{QUEUE}/{result_id}/reject", json=body, headers=world.mentor)
    assert response.status_code == 422
    assert db.get(SemesterResult, result_id).status == SubmissionStatus.pending


def test_reject_notifies_and_allows_reupload(client, world, db):
    first = upload(client, world).json()["id"]
    response = client.post(
        f"{QUEUE}/{first}/reject", json={"note": "Marksheet is unreadable"}, headers=world.mentor
    )
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert response.json()["rejection_note"] == "Marksheet is unreadable"

    note = db.scalar(
        select(Notification).where(Notification.type == notifications.SUBMISSION_REJECTED)
    )
    assert note.user_id == world.student_user.id

    assert upload(client, world).status_code == 201
    rows = db.scalars(select(SemesterResult).order_by(SemesterResult.id)).all()
    assert [r.status for r in rows] == [SubmissionStatus.rejected, SubmissionStatus.pending]

    assert (
        client.post(f"{QUEUE}/{first}/reject", json={"note": "x"}, headers=world.other_mentor).status_code
        == 404
    )
