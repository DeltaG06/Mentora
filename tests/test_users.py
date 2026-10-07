from sqlalchemy import select

from app.models import AuditLog, User
from app.models.enums import UserRole, UserStatus
from scripts.seed_admin import seed_admin
from tests.helpers import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PASSWORD,
    auth_header,
    login,
    mentor_payload,
    register,
    student_payload,
)

ADMIN_USERS = "/api/v1/admin/users"


def set_status(client, headers, user_id, new_status):
    return client.patch(
        f"{ADMIN_USERS}/{user_id}/status", json={"status": new_status}, headers=headers
    )


# --- seed -----------------------------------------------------------------


def test_seed_admin_is_idempotent(db):
    assert seed_admin(db, ADMIN_EMAIL, ADMIN_PASSWORD) is True
    assert seed_admin(db, ADMIN_EMAIL, "a-different-password") is False

    admins = db.scalars(select(User).where(User.role == UserRole.admin)).all()
    assert len(admins) == 1
    assert admins[0].status == UserStatus.active


def test_admin_login(client, admin_headers):
    me = client.get("/api/v1/auth/me", headers=admin_headers)
    assert me.status_code == 200
    assert me.json()["role"] == "admin"


# --- own profile ----------------------------------------------------------


def test_update_own_profile(client):
    token = register(client, student_payload()).json()["access_token"]
    response = client.patch(
        "/api/v1/users/me",
        json={"name": "Rohan N.", "phone": "9876543210"},
        headers=auth_header(token),
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Rohan N."
    assert response.json()["phone"] == "9876543210"


def test_update_own_profile_rejects_other_fields(client):
    token = register(client, student_payload()).json()["access_token"]
    response = client.patch(
        "/api/v1/users/me", json={"role": "admin"}, headers=auth_header(token)
    )
    assert response.status_code == 422


def test_change_password(client):
    token = register(client, student_payload()).json()["access_token"]
    response = client.patch(
        "/api/v1/users/me/password",
        json={"old_password": PASSWORD, "new_password": "brand-new-pass"},
        headers=auth_header(token),
    )
    assert response.status_code == 204
    assert login(client, "rohan@gec.ac.in", "brand-new-pass").status_code == 200
    assert login(client, "rohan@gec.ac.in", PASSWORD).status_code == 401


def test_change_password_wrong_old_password_is_400(client):
    token = register(client, student_payload()).json()["access_token"]
    response = client.patch(
        "/api/v1/users/me/password",
        json={"old_password": "not-my-password", "new_password": "brand-new-pass"},
        headers=auth_header(token),
    )
    assert response.status_code == 400


# --- admin: list ----------------------------------------------------------


def test_list_and_filter_users(client, admin_headers):
    register(client, student_payload())
    register(
        client,
        student_payload(
            name="Priya Shet",
            email="priya@gec.ac.in",
            roll_no="22ME010",
            department="Mechanical",
            year=3,
        ),
    )
    register(client, mentor_payload())

    def listing(**params):
        response = client.get(ADMIN_USERS, params=params, headers=admin_headers)
        assert response.status_code == 200
        return response.json()

    everyone = listing()
    assert everyone["total"] == 4  # 2 students + mentor + admin
    assert everyone["page"] == 1
    assert everyone["page_size"] == 20

    assert listing(role="student")["total"] == 2
    assert listing(status="pending")["total"] == 1
    assert listing(department="mechanical")["total"] == 2  # Priya + mentor
    assert listing(year=3)["items"][0]["email"] == "priya@gec.ac.in"

    # Case-insensitive search on name and on roll_no.
    assert [u["email"] for u in listing(search="ROHAN")["items"]] == ["rohan@gec.ac.in"]
    assert [u["email"] for u in listing(search="22me")["items"]] == ["priya@gec.ac.in"]

    assert "password_hash" not in everyone["items"][0]


def test_list_users_pagination(client, admin_headers):
    for i in range(3):
        register(
            client, student_payload(email=f"s{i}@gec.ac.in", roll_no=f"23CE00{i}")
        )

    response = client.get(
        ADMIN_USERS,
        params={"role": "student", "page": 2, "page_size": 2},
        headers=admin_headers,
    )
    body = response.json()
    assert body["total"] == 3
    assert len(body["items"]) == 1
    assert body["page"] == 2

    too_big = client.get(ADMIN_USERS, params={"page_size": 101}, headers=admin_headers)
    assert too_big.status_code == 422


def test_student_cannot_use_admin_endpoints(client):
    token = register(client, student_payload()).json()["access_token"]
    headers = auth_header(token)
    assert client.get(ADMIN_USERS, headers=headers).status_code == 403
    assert set_status(client, headers, 1, "deactivated").status_code == 403


# --- admin: edit ----------------------------------------------------------


def test_admin_edits_student_year_and_division(client, admin_headers, db):
    student_id = register(client, student_payload()).json()["user"]["id"]
    response = client.patch(
        f"{ADMIN_USERS}/{student_id}",
        json={"year": 3, "division": "B"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["year"] == 3
    assert response.json()["division"] == "B"

    entry = db.scalar(select(AuditLog).where(AuditLog.action == "user.update"))
    assert entry is not None and entry.entity_id == student_id


def test_admin_edit_accepts_only_year_and_division(client, admin_headers):
    student_id = register(client, student_payload()).json()["user"]["id"]
    response = client.patch(
        f"{ADMIN_USERS}/{student_id}", json={"name": "Hacked"}, headers=admin_headers
    )
    assert response.status_code == 422


def test_admin_edit_unknown_user_is_404(client, admin_headers):
    response = client.patch(
        f"{ADMIN_USERS}/9999", json={"year": 2}, headers=admin_headers
    )
    assert response.status_code == 404


# --- admin: status --------------------------------------------------------


def test_approve_pending_mentor_then_login(client, admin_headers):
    mentor_id = register(client, mentor_payload()).json()["user"]["id"]
    assert login(client, "anjali@gec.ac.in").status_code == 403

    response = set_status(client, admin_headers, mentor_id, "active")
    assert response.status_code == 200
    assert response.json()["status"] == "active"

    assert login(client, "anjali@gec.ac.in").status_code == 200


def test_invalid_transition_is_409(client, admin_headers):
    mentor_id = register(client, mentor_payload()).json()["user"]["id"]
    student_id = register(client, student_payload()).json()["user"]["id"]

    # pending -> deactivated, active -> pending, active -> active
    assert set_status(client, admin_headers, mentor_id, "deactivated").status_code == 409
    assert set_status(client, admin_headers, student_id, "pending").status_code == 409
    assert set_status(client, admin_headers, student_id, "active").status_code == 409


def test_deactivated_user_cannot_login_or_use_token(client, admin_headers):
    registered = register(client, student_payload()).json()
    student_id = registered["user"]["id"]

    assert set_status(client, admin_headers, student_id, "deactivated").status_code == 200

    response = login(client, "rohan@gec.ac.in")
    assert response.status_code == 403
    assert "deactivated" in response.json()["detail"].lower()

    # A token issued before deactivation stops working too.
    me = client.get("/api/v1/auth/me", headers=auth_header(registered["access_token"]))
    assert me.status_code == 403

    assert set_status(client, admin_headers, student_id, "active").status_code == 200
    assert login(client, "rohan@gec.ac.in").status_code == 200


def test_admin_cannot_change_own_status(client, admin_headers):
    admin_id = client.get("/api/v1/auth/me", headers=admin_headers).json()["id"]
    assert set_status(client, admin_headers, admin_id, "deactivated").status_code == 409


def test_status_change_writes_audit_log(client, admin_headers, db):
    mentor_id = register(client, mentor_payload()).json()["user"]["id"]
    admin_id = client.get("/api/v1/auth/me", headers=admin_headers).json()["id"]

    set_status(client, admin_headers, mentor_id, "active")
    set_status(client, admin_headers, mentor_id, "deactivated")
    set_status(client, admin_headers, mentor_id, "pending")  # 409: must not be logged

    entries = db.scalars(
        select(AuditLog)
        .where(AuditLog.action == "user.status_change")
        .order_by(AuditLog.id)
    ).all()
    assert [entry.details for entry in entries] == [
        "pending -> active",
        "active -> deactivated",
    ]
    for entry in entries:
        assert entry.actor_id == admin_id
        assert entry.entity == "user"
        assert entry.entity_id == mentor_id
        assert entry.timestamp is not None and entry.timestamp.tzinfo is not None
