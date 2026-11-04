from datetime import date, timedelta

import pytest

from app.models import GroupAttendance, GroupSession, Meeting, Semester, Slot, User
from app.models.enums import (
    FlagRule,
    FlagStatus,
    GroupSessionAudience,
    GroupSessionStatus,
    MeetingStatus,
    SlotStatus,
    SubmissionStatus,
    UserRole,
    UserStatus,
)
from app.models.types import utcnow
from app.services.flag_engine import raise_flags
from tests.helpers import (
    allocate,
    login_headers,
    make_internal,
    make_result,
    make_semester,
    make_user,
)

API = "/api/v1"


def make_meeting(db, mentor, student, start, status=MeetingStatus.scheduled):
    slot = Slot(
        mentor_id=mentor.id,
        start_time=start,
        end_time=start + timedelta(minutes=30),
        status=SlotStatus.completed if status == MeetingStatus.completed else SlotStatus.booked,
    )
    db.add(slot)
    db.flush()
    meeting = Meeting(
        slot_id=slot.id,
        student_id=student.id,
        agenda="Check-in",
        status=status,
        completed_at=utcnow() if status == MeetingStatus.completed else None,
        minutes="Discussed progress" if status == MeetingStatus.completed else None,
    )
    db.add(meeting)
    db.commit()
    return meeting


@pytest.fixture()
def world(client, db, admin_headers):
    """Desai mentors Rohan (red), Priya (amber) and Arjun (green); Zoe belongs
    to another mentor and Loner has no mentor."""
    now = utcnow()
    s1 = make_semester(db, "2025-26 Odd", date(2025, 7, 15))
    s2 = make_semester(
        db,
        "2025-26 Even",
        date(2026, 1, 10),
        internal_deadline=now + timedelta(days=3),
        result_deadline=now + timedelta(days=30),
    )
    desai = make_user(db, "desai", UserRole.mentor)
    other = make_user(db, "other", UserRole.mentor)
    make_user(db, "newbie", UserRole.mentor, status=UserStatus.pending)
    rohan = make_user(db, "rohan", UserRole.student, name="Rohan Naik")
    priya = make_user(db, "priya", UserRole.student, name="Priya Shet")
    arjun = make_user(db, "arjun", UserRole.student, name="Arjun Rao")
    zoe = make_user(db, "zoe", UserRole.student)
    loner = make_user(db, "loner", UserRole.student)
    for student in (rohan, priya, arjun):
        allocate(db, student, desai)
    allocate(db, zoe, other)

    make_result(db, rohan, s1, 8.2, verified_by=desai.id)
    make_result(db, rohan, s2, 6.4, verified_by=desai.id)
    make_result(db, priya, s1, 7.5, status=SubmissionStatus.pending)
    make_internal(db, arjun, s2, {"DSA": (15, 16, None)}, status=SubmissionStatus.pending)
    make_internal(db, rohan, s1, {"DSA": (12, 18, 8)}, verified_by=desai.id)

    (rohan_f1,) = raise_flags(db, rohan, s2, [(FlagRule.F1, "SGPA fell from 8.2 to 6.4")])
    (priya_f5,) = raise_flags(db, priya, s1, [(FlagRule.F5, "deadline missed")])
    (zoe_f3,) = raise_flags(db, zoe, s2, [(FlagRule.F3, "SGPA 5.8 (below 6.0)")])
    (old_f2,) = raise_flags(db, rohan, s1, [(FlagRule.F2, "Subject 'DSA' marks 32")])
    priya_f5.status = FlagStatus.escalated
    old_f2.status = FlagStatus.resolved
    old_f2.resolved_at = old_f2.raised_at + timedelta(hours=48)
    old_f2.resolution_note = "Cleared in re-exam"
    db.commit()

    make_meeting(db, desai, rohan, now + timedelta(days=1))
    make_meeting(db, desai, rohan, now - timedelta(days=2), MeetingStatus.completed)
    make_meeting(db, other, zoe, now + timedelta(days=1))

    session = GroupSession(
        mentor_id=desai.id,
        title="Exam strategy",
        audience=GroupSessionAudience.all,
        start_time=now + timedelta(days=4),
        end_time=now + timedelta(days=4, hours=1),
        status=GroupSessionStatus.scheduled,
    )
    db.add(session)
    db.flush()
    db.add(GroupAttendance(session_id=session.id, student_id=rohan.id))
    db.commit()

    class World:
        pass

    w = World()
    w.s1, w.s2 = s1.id, s2.id
    w.rohan_id, w.priya_id, w.arjun_id, w.zoe_id = rohan.id, priya.id, arjun.id, zoe.id
    w.desai_id, w.other_id = desai.id, other.id
    w.rohan_f1 = rohan_f1.id
    w.admin = admin_headers
    w.desai = login_headers(client, desai.email)
    w.other = login_headers(client, other.email)
    w.rohan = login_headers(client, rohan.email)
    w.loner = login_headers(client, loner.email)
    return w


def get(client, path, headers, **params):
    response = client.get(f"{API}{path}", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


# --- mentor -----------------------------------------------------------------


def test_mentor_roster_indicators_and_counts(client, world):
    body = get(client, "/mentor/dashboard", world.desai)
    roster = {entry["student"]["id"]: entry for entry in body["mentees"]}

    assert set(roster) == {world.rohan_id, world.priya_id, world.arjun_id}
    assert [entry["student"]["name"] for entry in body["mentees"]] == [
        "Arjun Rao",
        "Priya Shet",
        "Rohan Naik",
    ]
    assert roster[world.rohan_id]["indicator"] == "red"
    assert roster[world.rohan_id]["latest_sgpa"] == 6.4
    assert roster[world.rohan_id]["unresolved_flags"] == 1
    assert roster[world.priya_id]["indicator"] == "amber"
    assert roster[world.priya_id]["latest_sgpa"] is None  # pending result only
    assert roster[world.arjun_id]["indicator"] == "green"
    assert roster[world.arjun_id]["unresolved_flags"] == 0

    assert body["pending_internal_submissions"] == 1
    assert body["pending_results"] == 1
    assert body["upcoming_meetings"] == 1
    assert body["upcoming_group_sessions"] == 1


def test_mentor_roster_is_scoped_to_own_mentees(client, world):
    body = get(client, "/mentor/dashboard", world.other)
    assert [entry["student"]["id"] for entry in body["mentees"]] == [world.zoe_id]
    assert body["mentees"][0]["indicator"] == "red"
    assert body["pending_results"] == 0


def test_mentee_detail_has_full_history(client, world):
    body = get(client, f"/mentor/mentees/{world.rohan_id}", world.desai)

    assert body["student"]["email"] == "rohan@gec.ac.in"
    assert "password_hash" not in body["student"]
    assert [result["sgpa"] for result in body["results"]] == [8.2, 6.4]
    assert len(body["internal_submissions"]) == 1
    assert body["internal_submissions"][0]["subjects"][0]["effective_internal"] == 15
    assert {flag["status"] for flag in body["flags"]} == {"open", "resolved"}
    assert [m["status"] for m in body["meetings"]] == ["completed", "scheduled"]


def test_mentee_detail_is_404_for_non_mentees(client, world):
    for student_id in (world.zoe_id, 99999):
        response = client.get(f"{API}/mentor/mentees/{student_id}", headers=world.desai)
        assert response.status_code == 404
        assert response.json() == {"detail": "Student not found"}


def test_mentee_detail_rejects_students(client, world):
    response = client.get(f"{API}/mentor/mentees/{world.rohan_id}", headers=world.rohan)
    assert response.status_code == 403


# --- student ----------------------------------------------------------------


def test_student_dashboard(client, world):
    body = get(client, "/students/me/dashboard", world.rohan)

    assert body["mentor"]["id"] == world.desai_id
    assert body["sgpa_trend"] == [
        {"semester": {"id": world.s1, "label": "2025-26 Odd"}, "sgpa": 8.2},
        {"semester": {"id": world.s2, "label": "2025-26 Even"}, "sgpa": 6.4},
    ]
    assert body["flag_counts"] == {
        "open": 1,
        "in_discussion": 0,
        "escalated": 0,
        "resolved": 1,
    }
    assert [flag["id"] for flag in body["active_flags"]] == [world.rohan_f1]
    assert len(body["upcoming_meetings"]) == 1
    assert body["upcoming_group_sessions"][0]["title"] == "Exam strategy"

    deadline = body["next_deadline"]
    assert deadline["kind"] == "internal"
    assert deadline["semester"]["id"] == world.s2
    assert deadline["submitted"] is False


def test_student_next_deadline_reports_submission(client, db, world):
    rohan = db.get(User, world.rohan_id)
    semester = db.get(Semester, world.s2)
    make_internal(db, rohan, semester, {"OS": (10, 11, None)}, status=SubmissionStatus.pending)

    deadline = get(client, "/students/me/dashboard", world.rohan)["next_deadline"]
    assert deadline["kind"] == "internal" and deadline["submitted"] is True


def test_student_without_mentor_or_data(client, world):
    body = get(client, "/students/me/dashboard", world.loner)
    assert body["mentor"] is None
    assert body["sgpa_trend"] == []
    assert body["active_flags"] == []
    assert body["upcoming_meetings"] == []


def test_closed_semester_has_no_next_deadline(client, world):
    client.patch(
        f"{API}/admin/semesters/{world.s2}", json={"status": "closed"}, headers=world.admin
    )
    assert get(client, "/students/me/dashboard", world.rohan)["next_deadline"] is None


# --- admin ------------------------------------------------------------------


def test_admin_dashboard_metrics(client, world):
    body = get(client, "/admin/dashboard", world.admin)

    assert body["active_students"] == 5
    assert body["allocated_students"] == 4
    assert body["coverage_percent"] == 80.0
    assert body["pending_mentors"] == 1
    assert body["flag_counts"] == {
        "open": 2,
        "in_discussion": 0,
        "escalated": 1,
        "resolved": 1,
    }
    assert body["avg_resolution_hours"] == 48.0

    stats = {row["mentor"]["id"]: row for row in body["mentors"]}
    assert set(stats) == {world.desai_id, world.other_id}
    desai = stats[world.desai_id]
    assert desai["active_mentees"] == 3
    assert desai["meetings_completed"] == 1
    assert desai["meetings_scheduled"] == 1
    assert desai["group_sessions_completed"] == 0
    assert desai["unresolved_flags"] == 2
    assert stats[world.other_id]["unresolved_flags"] == 1


def test_admin_dashboard_semester_filter(client, world):
    body = get(client, "/admin/dashboard", world.admin, semester_id=world.s1)
    assert body["flag_counts"] == {
        "open": 0,
        "in_discussion": 0,
        "escalated": 1,
        "resolved": 1,
    }
    # Coverage does not depend on the semester.
    assert body["coverage_percent"] == 80.0


def test_admin_dashboard_empty_system(client, admin_headers):
    body = get(client, "/admin/dashboard", admin_headers)
    assert body["coverage_percent"] == 0.0
    assert body["avg_resolution_hours"] is None
    assert body["mentors"] == []


def test_admin_analytics(client, world):
    body = get(client, "/admin/analytics", world.admin)

    assert body["flags_by_rule"] == [
        {"rule": "F1", "count": 1},
        {"rule": "F2", "count": 1},
        {"rule": "F3", "count": 1},
        {"rule": "F4", "count": 0},
        {"rule": "F5", "count": 1},
    ]
    trend = body["meetings_trend"]
    assert len(trend) == 8
    assert sum(week["completed"] for week in trend) == 1
    weeks = [date.fromisoformat(week["week_start"]) for week in trend]
    assert all(week.weekday() == 0 for week in weeks)
    assert weeks == sorted(weeks)


def test_admin_analytics_week_bounds(client, world):
    assert len(get(client, "/admin/analytics", world.admin, weeks=1)["meetings_trend"]) == 1
    response = client.get(f"{API}/admin/analytics?weeks=0", headers=world.admin)
    assert response.status_code == 422


@pytest.mark.parametrize(
    "path, who",
    [
        ("/admin/dashboard", "desai"),
        ("/admin/analytics", "rohan"),
        ("/mentor/dashboard", "rohan"),
        ("/students/me/dashboard", "desai"),
        ("/students/me/dashboard", "admin"),
    ],
)
def test_dashboards_enforce_roles(client, world, path, who):
    response = client.get(f"{API}{path}", headers=getattr(world, who))
    assert response.status_code == 403


def test_dashboards_require_auth(client):
    assert client.get(f"{API}/mentor/dashboard").status_code == 401
