from fastapi import Depends

from app.api.deps import require_roles
from app.main import app
from app.models.enums import UserRole
from tests.helpers import (
    auth_header,
    login,
    mentor_payload,
    register,
    student_payload,
)


# Dummy protected route, only registered in the test process.
@app.get("/_test/admin-only")
def _admin_only(_user=Depends(require_roles(UserRole.admin))):
    return {"ok": True}


def test_register_student_is_active(client):
    response = register(client, student_payload())
    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["role"] == "student"
    assert body["user"]["status"] == "active"
    assert body["user"]["roll_no"] == "23CE045"


def test_register_mentor_is_pending(client):
    response = register(client, mentor_payload())
    assert response.status_code == 201
    user = response.json()["user"]
    assert user["role"] == "mentor"
    assert user["status"] == "pending"
    assert user["designation"] == "Associate Professor"
    assert user["roll_no"] is None


def test_responses_never_expose_password_hash(client):
    body = register(client, student_payload()).json()
    assert "password_hash" not in body["user"]
    assert "password" not in body["user"]

    me = client.get("/api/v1/auth/me", headers=auth_header(body["access_token"]))
    assert "password_hash" not in me.json()


def test_register_rejects_admin_role(client):
    response = register(client, student_payload(role="admin"))
    assert response.status_code == 422


def test_register_student_requires_student_fields(client):
    payload = student_payload()
    del payload["roll_no"]
    assert register(client, payload).status_code == 422


def test_register_mentor_requires_designation(client):
    payload = mentor_payload()
    del payload["designation"]
    assert register(client, payload).status_code == 422


def test_duplicate_email_is_409(client):
    assert register(client, student_payload()).status_code == 201
    # Same email (different case), different roll number.
    response = register(
        client, student_payload(email="ROHAN@gec.ac.in", roll_no="23CE046")
    )
    assert response.status_code == 409


def test_duplicate_roll_no_is_409(client):
    assert register(client, student_payload()).status_code == 201
    response = register(client, student_payload(email="other@gec.ac.in"))
    assert response.status_code == 409


def test_login_student(client):
    register(client, student_payload())
    response = login(client, "rohan@gec.ac.in")
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "rohan@gec.ac.in"


def test_login_pending_mentor_is_403(client):
    register(client, mentor_payload())
    response = login(client, "anjali@gec.ac.in")
    assert response.status_code == 403
    assert "pending" in response.json()["detail"].lower()


def test_login_bad_credentials_is_401(client):
    register(client, student_payload())
    assert login(client, "rohan@gec.ac.in", "wrong-password").status_code == 401
    assert login(client, "nobody@gec.ac.in").status_code == 401


def test_me_returns_profile(client):
    token = register(client, student_payload()).json()["access_token"]
    response = client.get("/api/v1/auth/me", headers=auth_header(token))
    assert response.status_code == 200
    assert response.json()["email"] == "rohan@gec.ac.in"


def test_me_without_token_is_401(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_with_garbage_token_is_401(client):
    response = client.get("/api/v1/auth/me", headers=auth_header("not-a-jwt"))
    assert response.status_code == 401


def test_pending_mentor_token_is_rejected(client):
    token = register(client, mentor_payload()).json()["access_token"]
    response = client.get("/api/v1/auth/me", headers=auth_header(token))
    assert response.status_code == 403


def test_require_roles_denies_wrong_role(client):
    token = register(client, student_payload()).json()["access_token"]
    response = client.get("/_test/admin-only", headers=auth_header(token))
    assert response.status_code == 403
