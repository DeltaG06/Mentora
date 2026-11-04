"""The demo story end to end, through the public API only (docs/context.txt §13).

Shweta allocates Rohan to Prof. Desai -> Rohan uploads results (SGPA 8.2, then
6.4) -> Desai verifies -> F1 fires and both are notified -> Desai sees red on
her roster -> invites Rohan to a slot -> the meeting is held with the flag
linked -> the flag is resolved with a note -> Shweta's dashboard shows it.
"""

import json
from datetime import timedelta
from pathlib import Path

from app.models.types import utcnow
from tests.helpers import auth_header, login_headers, mentor_payload, register, student_payload

API = "/api/v1"
PROOF = Path(__file__).parent / "fixtures" / "proof.pdf"


def ok(response, status=200):
    assert response.status_code == status, response.text
    return response.json() if response.content else None


def upload_result(client, headers, semester_id, sgpa, marks):
    subjects = [{"subject_name": name, "final_marks": score} for name, score in marks.items()]
    with PROOF.open("rb") as proof:
        return client.post(
            f"{API}/students/me/results",
            data={"semester_id": str(semester_id), "sgpa": str(sgpa), "subjects": json.dumps(subjects)},
            files={"proof_file": ("result.pdf", proof, "application/pdf")},
            headers=headers,
        )


def test_demo_story(client, admin_headers):
    admin = admin_headers

    # Registration: the mentor waits for approval, the student is active at once.
    mentor = ok(register(client, mentor_payload(department="Computer")), 201)["user"]
    assert mentor["status"] == "pending"
    rohan = ok(register(client, student_payload()), 201)
    rohan_headers = auth_header(rohan["access_token"])
    rohan = rohan["user"]

    pending = ok(client.get(f"{API}/admin/users?status=pending", headers=admin))
    assert [u["id"] for u in pending["items"]] == [mentor["id"]]
    ok(client.patch(f"{API}/admin/users/{mentor['id']}/status", json={"status": "active"}, headers=admin))
    desai = login_headers(client, mentor["email"])

    # Two semesters, the earlier one first in time.
    sem1 = ok(client.post(f"{API}/admin/semesters", json={"label": "2025-26 Even", "start_date": "2026-01-05"}, headers=admin), 201)
    sem2 = ok(client.post(f"{API}/admin/semesters", json={"label": "2026-27 Odd", "start_date": "2026-07-14"}, headers=admin), 201)

    # Allocation.
    allocation = ok(client.post(f"{API}/admin/allocations", json={"mentor_id": mentor["id"], "student_ids": [rohan["id"]]}, headers=admin))
    assert allocation["results"][0]["status"] == "assigned"
    assert ok(client.get(f"{API}/students/me/mentor", headers=rohan_headers))["id"] == mentor["id"]

    # First result: no baseline, nothing below the thresholds, no flags.
    first = ok(upload_result(client, rohan_headers, sem1["id"], 8.2, {"DSA": 82, "DBMS": 79}), 201)
    verified = ok(client.post(f"{API}/mentor/results/{first['id']}/verify", headers=desai))
    assert verified["flags_raised"] == []

    # Second result drops by 1.8: F1 fires on verification.
    second = ok(upload_result(client, rohan_headers, sem2["id"], 6.4, {"OS": 61, "CN": 58}), 201)
    queue = ok(client.get(f"{API}/mentor/results", headers=desai))
    assert [r["id"] for r in queue] == [second["id"]]
    verified = ok(client.post(f"{API}/mentor/results/{second['id']}/verify", headers=desai))
    (f1,) = verified["flags_raised"]
    assert f1["rule"] == "F1" and f1["reason"] == "SGPA fell from 8.2 to 6.4"

    # Both sides are told.
    for headers in (rohan_headers, desai):
        titles = [n["title"] for n in ok(client.get(f"{API}/notifications", headers=headers))["items"]]
        assert "Flag raised: F1" in titles

    # Red on the roster, and visible on the student's own dashboard.
    roster = ok(client.get(f"{API}/mentor/dashboard", headers=desai))["mentees"]
    assert roster[0]["indicator"] == "red" and roster[0]["latest_sgpa"] == 6.4
    student_view = ok(client.get(f"{API}/students/me/dashboard", headers=rohan_headers))
    assert [p["sgpa"] for p in student_view["sgpa_trend"]] == [8.2, 6.4]
    assert student_view["flag_counts"]["open"] == 1

    # Invite Rohan to a slot.
    start = (utcnow() + timedelta(days=1)).isoformat()
    slot = ok(client.post(f"{API}/mentor/slots", json={"date_time": start}, headers=desai), 201)
    meeting = ok(client.post(f"{API}/mentor/slots/{slot['id']}/invite", json={"student_id": rohan["id"]}, headers=desai), 201)
    assert meeting["invited_by_mentor"] is True
    assert ok(client.get(f"{API}/students/me/meetings?upcoming=true", headers=rohan_headers))[0]["id"] == meeting["id"]

    # The meeting is held with the flag on the agenda.
    held = ok(client.post(
        f"{API}/meetings/{meeting['id']}/complete",
        json={"minutes": "Agreed a weekly study plan.", "linked_flag_ids": [f1["id"]]},
        headers=desai,
    ))
    assert [f["status"] for f in held["flags_moved"]] == ["in_discussion"]

    # Resolution needs a note.
    assert client.post(f"{API}/flags/{f1['id']}/resolve", json={"resolution_note": " "}, headers=desai).status_code == 422
    resolved = ok(client.post(f"{API}/flags/{f1['id']}/resolve", json={"resolution_note": "Study plan in place."}, headers=desai))
    assert resolved["status"] == "resolved"

    # Green again, and the coordinator sees the scheme working.
    assert ok(client.get(f"{API}/mentor/dashboard", headers=desai))["mentees"][0]["indicator"] == "green"
    overview = ok(client.get(f"{API}/admin/dashboard", headers=admin))
    assert overview["coverage_percent"] == 100.0
    assert overview["flag_counts"]["resolved"] == 1
    assert overview["avg_resolution_hours"] is not None
    (stats,) = overview["mentors"]
    assert stats["meetings_completed"] == 1 and stats["unresolved_flags"] == 0
