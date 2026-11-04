from sqlalchemy import func, select

from app.models import Flag, Meeting, SemesterResult, User
from app.models.enums import FlagRule, FlagStatus, SubmissionStatus, UserStatus
from scripts import seed_demo
from tests.helpers import login_headers

API = "/api/v1"


def test_guard_refuses_without_env(monkeypatch, capsys):
    monkeypatch.delenv("SEED_DEMO", raising=False)
    assert seed_demo.main() == 1
    assert "SEED_DEMO=1" in capsys.readouterr().out


def test_demo_scenario(client, db):
    assert seed_demo.build_demo(db, password="demo-pass-1") is True
    # Idempotent: a second run changes nothing.
    users = db.scalar(select(func.count()).select_from(User))
    assert seed_demo.build_demo(db, password="demo-pass-1") is False
    assert db.scalar(select(func.count()).select_from(User)) == users

    flags = {
        (flag.student.name, flag.rule): flag.status
        for flag in db.scalars(select(Flag))
    }
    assert flags == {
        ("Priya Shet", FlagRule.F2): FlagStatus.resolved,
        ("Akash Gawas", FlagRule.F3): FlagStatus.escalated,
        ("Akash Gawas", FlagRule.F5): FlagStatus.open,
        ("Kevin D'Souza", FlagRule.F4): FlagStatus.open,
    }
    pending_mentor = db.scalar(select(User).where(User.email == "neha.prabhu@gec.ac.in"))
    assert pending_mentor.status == UserStatus.pending
    assert db.scalar(select(func.count()).select_from(Meeting)) == 4

    # The live demo: verifying Rohan's pending result raises F1.
    desai = login_headers(client, "anjali.desai@gec.ac.in", "demo-pass-1")
    rohan_result = db.scalar(
        select(SemesterResult).where(SemesterResult.status == SubmissionStatus.pending)
    )
    response = client.post(f"{API}/mentor/results/{rohan_result.id}/verify", headers=desai)
    assert response.status_code == 200, response.text
    (flag,) = response.json()["flags_raised"]
    assert flag["rule"] == "F1" and flag["reason"] == "SGPA fell from 8.2 to 6.4"

    # The proof file was written and is served to the mentor.
    proof = client.get(f"{API}/mentor/results/{rohan_result.id}/proof", headers=desai)
    assert proof.status_code == 200 and proof.content.startswith(b"%PDF-")
