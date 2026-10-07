from datetime import datetime, timezone

from app.models import Semester
from app.models.enums import SemesterStatus, UserRole
from tests.helpers import login_headers, make_user

SEMESTERS = "/api/v1/semesters"
ADMIN_SEMESTERS = "/api/v1/admin/semesters"


def create(client, headers, **body):
    return client.post(ADMIN_SEMESTERS, json=body, headers=headers)


def patch(client, headers, semester_id, **body):
    return client.patch(f"{ADMIN_SEMESTERS}/{semester_id}", json=body, headers=headers)


def test_create_semester(client, admin_headers):
    response = create(client, admin_headers, label="2026-27 Odd", start_date="2026-07-15")
    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "label": "2026-27 Odd",
        "start_date": "2026-07-15",
        "internal_deadline": None,
        "result_deadline": None,
        "status": "open",
    }


def test_create_semester_without_start_date(client, admin_headers):
    response = create(client, admin_headers, label="2026-27 Even")
    assert response.status_code == 201
    assert response.json()["start_date"] is None
    assert response.json()["status"] == "open"


def test_create_semester_validation(client, admin_headers):
    assert create(client, admin_headers).status_code == 422
    assert create(client, admin_headers, label="   ").status_code == 422
    assert create(client, admin_headers, label="X", start_date="not-a-date").status_code == 422
    # status cannot be chosen at creation; it is always 'open'.
    assert create(client, admin_headers, label="X", status="closed").status_code == 422


def test_duplicate_label_is_409(client, admin_headers):
    assert create(client, admin_headers, label="2026-27 Odd").status_code == 201
    assert create(client, admin_headers, label="2026-27 Odd").status_code == 409


def test_patch_internal_deadline(client, admin_headers, db):
    semester_id = create(client, admin_headers, label="S1").json()["id"]
    response = patch(
        client, admin_headers, semester_id, internal_deadline="2026-09-15T18:30:00+05:30"
    )
    assert response.status_code == 200
    assert response.json()["internal_deadline"] == "2026-09-15T13:00:00Z"
    assert response.json()["result_deadline"] is None

    stored = db.get(Semester, semester_id).internal_deadline
    assert stored == datetime(2026, 9, 15, 13, 0, tzinfo=timezone.utc)


def test_patch_result_deadline_allows_past_dates(client, admin_headers):
    semester_id = create(client, admin_headers, label="S1").json()["id"]
    response = patch(
        client, admin_headers, semester_id, result_deadline="2020-01-01T00:00:00Z"
    )
    assert response.status_code == 200
    assert response.json()["result_deadline"] == "2020-01-01T00:00:00Z"


def test_patch_status(client, admin_headers, db):
    semester_id = create(client, admin_headers, label="S1").json()["id"]

    closed = patch(client, admin_headers, semester_id, status="closed")
    assert closed.status_code == 200 and closed.json()["status"] == "closed"
    assert db.get(Semester, semester_id).status == SemesterStatus.closed

    reopened = patch(client, admin_headers, semester_id, status="open")
    assert reopened.json()["status"] == "open"


def test_patch_leaves_unsent_fields_alone(client, admin_headers):
    semester_id = create(client, admin_headers, label="S1").json()["id"]
    patch(client, admin_headers, semester_id, internal_deadline="2026-09-15T00:00:00Z")
    body = patch(client, admin_headers, semester_id, status="closed").json()
    assert body["internal_deadline"] == "2026-09-15T00:00:00Z"


def test_patch_rejects_invalid_values(client, admin_headers):
    semester_id = create(client, admin_headers, label="S1").json()["id"]
    assert patch(client, admin_headers, semester_id, status="archived").status_code == 422
    # Deadlines must be timezone-aware.
    assert (
        patch(client, admin_headers, semester_id, internal_deadline="2026-09-15T18:30:00").status_code
        == 422
    )
    # Only the two deadlines and status are editable here.
    assert patch(client, admin_headers, semester_id, label="Renamed").status_code == 422


def test_patch_unknown_semester_is_404(client, admin_headers):
    assert patch(client, admin_headers, 9999, status="closed").status_code == 404


def test_list_is_visible_to_students_newest_first(client, admin_headers, db):
    create(client, admin_headers, label="S1")
    create(client, admin_headers, label="S2")
    student = make_user(db, "s1", UserRole.student)

    response = client.get(SEMESTERS, headers=login_headers(client, student.email))
    assert response.status_code == 200
    assert [s["label"] for s in response.json()] == ["S2", "S1"]
    assert set(response.json()[0]) == {
        "id",
        "label",
        "start_date",
        "internal_deadline",
        "result_deadline",
        "status",
    }


def test_list_requires_authentication(client):
    assert client.get(SEMESTERS).status_code == 401


def test_non_admin_cannot_create_or_patch(client, admin_headers, db):
    semester_id = create(client, admin_headers, label="S1").json()["id"]
    student = make_user(db, "s1", UserRole.student)
    mentor = make_user(db, "m1", UserRole.mentor)

    for user in (student, mentor):
        headers = login_headers(client, user.email)
        assert create(client, headers, label="Nope").status_code == 403
        assert patch(client, headers, semester_id, status="closed").status_code == 403
