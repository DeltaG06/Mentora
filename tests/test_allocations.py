import pytest
from sqlalchemy import select

from app.models import Allocation, AuditLog, Notification
from app.models.enums import AllocationStatus, UserRole, UserStatus
from app.services import notifications
from tests.helpers import login_headers, make_user

ALLOCATIONS = "/api/v1/admin/allocations"
MY_MENTOR = "/api/v1/students/me/mentor"


@pytest.fixture()
def mentor(db):
    return make_user(db, "desai", UserRole.mentor)


def assign(client, headers, mentor_id, student_ids):
    return client.post(
        ALLOCATIONS,
        json={"mentor_id": mentor_id, "student_ids": student_ids},
        headers=headers,
    )


def allocations_for(db, student_id):
    db.expire_all()
    return db.scalars(
        select(Allocation)
        .where(Allocation.student_id == student_id)
        .order_by(Allocation.id)
    ).all()


def test_assign_happy_path(client, admin_headers, db, mentor):
    students = [make_user(db, f"s{i}", UserRole.student) for i in range(2)]
    ids = [s.id for s in students]

    response = assign(client, admin_headers, mentor.id, ids)
    assert response.status_code == 200
    body = response.json()
    assert body["results"] == [
        {"student_id": ids[0], "status": "assigned", "reason": None},
        {"student_id": ids[1], "status": "assigned", "reason": None},
    ]
    assert body["warnings"] == []

    rows = db.scalars(select(Allocation)).all()
    assert len(rows) == 2
    assert all(row.status == AllocationStatus.active for row in rows)
    assert all(row.mentor_id == mentor.id for row in rows)


def test_assign_notifies_and_audits(client, admin_headers, db, mentor):
    student = make_user(db, "s1", UserRole.student)
    assign(client, admin_headers, mentor.id, [student.id])

    notes = db.scalars(select(Notification)).all()
    assert {note.user_id for note in notes} == {mentor.id, student.id}
    assert all(note.type == notifications.ALLOCATION for note in notes)

    entries = db.scalars(
        select(AuditLog).where(AuditLog.action == "allocation.create")
    ).all()
    assert len(entries) == 1
    assert entries[0].entity == "allocation"
    assert entries[0].entity_id == db.scalar(select(Allocation.id))


def test_mixed_request_is_per_student(client, admin_headers, db, mentor):
    ok_1 = make_user(db, "s1", UserRole.student)
    other_dept = make_user(db, "s2", UserRole.student, department="Mechanical")
    ok_2 = make_user(db, "s3", UserRole.student)

    response = assign(
        client, admin_headers, mentor.id, [ok_1.id, other_dept.id, 9999, ok_2.id]
    )
    assert response.status_code == 200
    by_id = {r["student_id"]: r for r in response.json()["results"]}

    assert by_id[ok_1.id]["status"] == "assigned"
    assert by_id[ok_2.id]["status"] == "assigned"
    assert by_id[other_dept.id] == {
        "student_id": other_dept.id,
        "status": "failed",
        "reason": "mentor and student departments differ",
    }
    assert by_id[9999]["reason"] == "student not found"

    # The failures did not roll back the successes.
    assert len(allocations_for(db, ok_1.id)) == 1
    assert len(allocations_for(db, ok_2.id)) == 1
    assert allocations_for(db, other_dept.id) == []
    # One audit row per successful assignment only.
    assert len(db.scalars(select(AuditLog)).all()) == 2


def test_non_student_id_is_student_not_found(client, admin_headers, db, mentor):
    other_mentor = make_user(db, "m2", UserRole.mentor)
    result = assign(client, admin_headers, mentor.id, [other_mentor.id]).json()
    assert result["results"][0]["reason"] == "student not found"


def test_double_assign_fails(client, admin_headers, db, mentor):
    other_mentor = make_user(db, "m2", UserRole.mentor)
    student = make_user(db, "s1", UserRole.student)

    assert assign(client, admin_headers, mentor.id, [student.id]).json()["results"][0][
        "status"
    ] == "assigned"

    second = assign(client, admin_headers, other_mentor.id, [student.id]).json()
    assert second["results"] == [
        {
            "student_id": student.id,
            "status": "failed",
            "reason": "student already has an active allocation",
        }
    ]
    assert len(allocations_for(db, student.id)) == 1


def test_duplicate_id_in_one_request_assigns_once(client, admin_headers, db, mentor):
    student = make_user(db, "s1", UserRole.student)
    results = assign(client, admin_headers, mentor.id, [student.id, student.id]).json()[
        "results"
    ]
    assert [r["status"] for r in results] == ["assigned", "failed"]
    assert len(allocations_for(db, student.id)) == 1


@pytest.mark.parametrize(
    "overrides",
    [{"status": UserStatus.pending}, {"status": UserStatus.deactivated}],
)
def test_inactive_mentor_is_404(client, admin_headers, db, overrides):
    inactive = make_user(db, "m2", UserRole.mentor, **overrides)
    student = make_user(db, "s1", UserRole.student)
    assert assign(client, admin_headers, inactive.id, [student.id]).status_code == 404


def test_mentor_id_that_is_not_a_mentor_is_404(client, admin_headers, db):
    student = make_user(db, "s1", UserRole.student)
    assert assign(client, admin_headers, student.id, [student.id]).status_code == 404
    assert assign(client, admin_headers, 9999, [student.id]).status_code == 404


def test_over_capacity_warns_but_succeeds(client, admin_headers, db, mentor):
    students = [make_user(db, f"s{i:02d}", UserRole.student) for i in range(16)]

    first_15 = assign(client, admin_headers, mentor.id, [s.id for s in students[:15]])
    assert first_15.json()["warnings"] == []  # exactly 15 is fine

    sixteenth = assign(client, admin_headers, mentor.id, [students[15].id]).json()
    assert sixteenth["results"][0]["status"] == "assigned"
    assert len(sixteenth["warnings"]) == 1
    assert "16 active mentees" in sixteenth["warnings"][0]

    assert len(db.scalars(select(Allocation)).all()) == 16


def test_reassign_keeps_both_rows(client, admin_headers, db, mentor):
    new_mentor = make_user(db, "m2", UserRole.mentor)
    student = make_user(db, "s1", UserRole.student)
    assign(client, admin_headers, mentor.id, [student.id])
    old_id = allocations_for(db, student.id)[0].id

    response = client.post(
        f"{ALLOCATIONS}/{old_id}/reassign",
        json={"new_mentor_id": new_mentor.id},
        headers=admin_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["allocation"]["mentor"]["id"] == new_mentor.id
    assert body["allocation"]["status"] == "active"

    old, new = allocations_for(db, student.id)
    assert old.id == old_id
    assert old.status == AllocationStatus.ended
    assert old.ended_at is not None
    assert old.mentor_id == mentor.id
    assert new.status == AllocationStatus.active
    assert new.ended_at is None
    assert new.mentor_id == new_mentor.id


def test_reassign_notifies_all_three(client, admin_headers, db, mentor):
    new_mentor = make_user(db, "m2", UserRole.mentor)
    student = make_user(db, "s1", UserRole.student)
    assign(client, admin_headers, mentor.id, [student.id])
    old_id = allocations_for(db, student.id)[0].id
    before = len(db.scalars(select(Notification)).all())

    client.post(
        f"{ALLOCATIONS}/{old_id}/reassign",
        json={"new_mentor_id": new_mentor.id},
        headers=admin_headers,
    )

    db.expire_all()
    notes = db.scalars(select(Notification).order_by(Notification.id)).all()[before:]
    assert {note.user_id for note in notes} == {mentor.id, new_mentor.id, student.id}
    assert db.scalar(select(AuditLog).where(AuditLog.action == "allocation.reassign"))


def test_reassign_errors(client, admin_headers, db, mentor):
    cross_dept = make_user(db, "m2", UserRole.mentor, department="Mechanical")
    pending = make_user(db, "m3", UserRole.mentor, status=UserStatus.pending)
    student = make_user(db, "s1", UserRole.student)
    assign(client, admin_headers, mentor.id, [student.id])
    old_id = allocations_for(db, student.id)[0].id

    def reassign(allocation_id, new_mentor_id):
        return client.post(
            f"{ALLOCATIONS}/{allocation_id}/reassign",
            json={"new_mentor_id": new_mentor_id},
            headers=admin_headers,
        )

    assert reassign(old_id, cross_dept.id).status_code == 400
    assert reassign(old_id, mentor.id).status_code == 400  # same mentor
    assert reassign(old_id, pending.id).status_code == 404
    assert reassign(old_id, 9999).status_code == 404
    assert reassign(9999, mentor.id).status_code == 404

    # Nothing changed.
    rows = allocations_for(db, student.id)
    assert len(rows) == 1 and rows[0].status == AllocationStatus.active


def test_reassign_ended_allocation_is_409(client, admin_headers, db, mentor):
    m2 = make_user(db, "m2", UserRole.mentor)
    m3 = make_user(db, "m3", UserRole.mentor)
    student = make_user(db, "s1", UserRole.student)
    assign(client, admin_headers, mentor.id, [student.id])
    old_id = allocations_for(db, student.id)[0].id
    url = f"{ALLOCATIONS}/{old_id}/reassign"

    assert client.post(url, json={"new_mentor_id": m2.id}, headers=admin_headers).status_code == 200
    assert client.post(url, json={"new_mentor_id": m3.id}, headers=admin_headers).status_code == 409


def test_list_allocations_filters_and_pagination(client, admin_headers, db, mentor):
    mech_mentor = make_user(db, "m2", UserRole.mentor, department="Mechanical")
    cs = [make_user(db, f"s{i}", UserRole.student) for i in range(3)]
    mech = make_user(db, "s9", UserRole.student, department="Mechanical")
    assign(client, admin_headers, mentor.id, [s.id for s in cs])
    assign(client, admin_headers, mech_mentor.id, [mech.id])

    def listing(**params):
        response = client.get(ALLOCATIONS, params=params, headers=admin_headers)
        assert response.status_code == 200
        return response.json()

    assert listing()["total"] == 4
    assert listing(mentor_id=mentor.id)["total"] == 3
    assert listing(department="mechanical")["total"] == 1
    assert listing(status="ended")["total"] == 0
    assert listing(status="active")["total"] == 4

    page = listing(page=2, page_size=3)
    assert page["total"] == 4 and len(page["items"]) == 1 and page["page"] == 2

    item = listing(department="Mechanical")["items"][0]
    assert item["student"]["roll_no"] == "S9"
    assert item["mentor"]["email"] == "m2@gec.ac.in"

    assert (
        client.get(ALLOCATIONS, params={"page_size": 101}, headers=admin_headers).status_code
        == 422
    )


def test_student_sees_own_mentor(client, admin_headers, db, mentor):
    student = make_user(db, "s1", UserRole.student)
    assign(client, admin_headers, mentor.id, [student.id])

    response = client.get(MY_MENTOR, headers=login_headers(client, student.email))
    assert response.status_code == 200
    assert response.json() == {
        "id": mentor.id,
        "name": mentor.name,
        "department": "Computer",
        "designation": "Assistant Professor",
        "email": "desai@gec.ac.in",
    }


def test_unassigned_student_gets_404(client, db):
    student = make_user(db, "s1", UserRole.student)
    response = client.get(MY_MENTOR, headers=login_headers(client, student.email))
    assert response.status_code == 404


def test_student_cannot_use_admin_allocation_endpoints(client, db, mentor):
    student = make_user(db, "s1", UserRole.student)
    headers = login_headers(client, student.email)

    assert assign(client, headers, mentor.id, [student.id]).status_code == 403
    assert client.get(ALLOCATIONS, headers=headers).status_code == 403
    assert (
        client.post(
            f"{ALLOCATIONS}/1/reassign", json={"new_mentor_id": mentor.id}, headers=headers
        ).status_code
        == 403
    )


def test_mentor_cannot_use_student_mentor_endpoint(client, db, mentor):
    response = client.get(MY_MENTOR, headers=login_headers(client, mentor.email))
    assert response.status_code == 403
