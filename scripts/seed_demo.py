"""Load the demo scenario: one command to a fully populated Mentora.

    SEED_DEMO=1 python -m scripts.seed_demo          (PowerShell: $env:SEED_DEMO="1")

Guarded by SEED_DEMO=1 so it never runs against a database by accident, and
idempotent: if the demo coordinator account already exists nothing changes.
Every account uses DEMO_PASSWORD (default: mentora-demo).

The story it sets up (docs/context.txt, section 13):

* Shweta Kamat coordinates the scheme. Prof. Anjali Desai mentors six
  Computer students, including Rohan Naik.
* Rohan's previous result (SGPA 6.4, down from 8.2) is waiting for Desai's
  verification. Verifying it raises F1 live during the demo.
* Priya's F2 was discussed in a meeting and resolved; Akash's F3 has sat
  open for three weeks and is escalated; Akash also missed the internal
  marks deadline (F5); Kevin's weak internals raised F4 and he has booked a
  meeting about it.
* Prof. Rao has left the college: his two former mentees are unallocated,
  ready for the allocation demo. Prof. Neha Prabhu awaits approval.

Records are written through the flag engine, so flags, notifications and
reasons are exactly what the live system would produce.
"""

import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.jobs import run_daily_jobs  # noqa: E402
from app.models.academics import (  # noqa: E402
    InternalMark,
    InternalSubmission,
    ResultSubject,
    Semester,
    SemesterResult,
)
from app.models.enums import (  # noqa: E402
    AllocationStatus,
    FlagRule,
    GroupSessionAudience,
    GroupSessionStatus,
    MeetingStatus,
    SemesterStatus,
    SlotStatus,
    SubmissionStatus,
    UserRole,
    UserStatus,
)
from app.models.flag import Flag  # noqa: E402
from app.models.meeting import (  # noqa: E402
    GroupAttendance,
    GroupSession,
    Meeting,
    MeetingFlag,
    Slot,
)
from app.models.types import utcnow  # noqa: E402
from app.models.user import Allocation, User  # noqa: E402
from app.services import flag_engine  # noqa: E402
from app.services.audit import log_action  # noqa: E402
from app.services.proof_storage import save_proof  # noqa: E402

IST = ZoneInfo("Asia/Kolkata")
COORDINATOR_EMAIL = "shweta.kamat@gec.ac.in"
DEFAULT_PASSWORD = "mentora-demo"

SUBJECTS = {
    "A": ["Discrete Mathematics", "Digital Logic Design", "Object Oriented Programming", "Computer Organisation"],
    "B": ["Data Structures", "Database Systems", "Operating Systems", "Probability and Statistics"],
    "C": ["Computer Networks", "Theory of Computation", "Software Engineering", "Design and Analysis of Algorithms"],
}
MECH_SUBJECTS = {
    "A": ["Engineering Mechanics", "Thermodynamics", "Material Science", "Manufacturing Processes"],
    "B": ["Fluid Mechanics", "Strength of Materials", "Kinematics of Machines", "Metrology"],
    "C": ["Heat Transfer", "Machine Design", "Dynamics of Machines", "Industrial Engineering"],
}


@dataclass
class StudentPlan:
    key: str
    name: str
    roll_no: str
    year: int
    division: str
    department: str = "Computer"
    sgpa_a: float = 8.0
    sgpa_b: float = 8.0


# --- small helpers ------------------------------------------------------------


def at(days: int, hour: int, minute: int = 0, now: datetime | None = None) -> datetime:
    """A wall-clock time in IST, `days` from today, as an aware UTC datetime."""
    today = (now or utcnow()).astimezone(IST).date()
    local = datetime.combine(today + timedelta(days=days), datetime.min.time(), IST)
    return local.replace(hour=hour, minute=minute).astimezone(timezone.utc)


def semester_labels(today: date) -> list[tuple[str, date]]:
    """The current semester and the two before it, oldest first.

    Odd semesters start in mid-July, even ones in early January.
    """
    if today.month >= 7:
        current = (f"{today.year}-{str(today.year + 1)[2:]} Odd", date(today.year, 7, 14))
        previous = (f"{today.year - 1}-{str(today.year)[2:]} Even", date(today.year, 1, 5))
        before = (f"{today.year - 1}-{str(today.year)[2:]} Odd", date(today.year - 1, 7, 14))
    else:
        current = (f"{today.year - 1}-{str(today.year)[2:]} Even", date(today.year, 1, 5))
        previous = (f"{today.year - 1}-{str(today.year)[2:]} Odd", date(today.year - 1, 7, 14))
        before = (f"{today.year - 2}-{str(today.year - 1)[2:]} Even", date(today.year - 1, 1, 5))
    return [before, previous, current]


def result_pdf(student: User, semester: Semester, sgpa: float, marks: dict[str, int]) -> bytes:
    """A one-page PDF statement of marks, used as the demo proof file."""
    lines = [
        ("Goa College of Engineering", 16),
        ("Statement of Marks (demo copy)", 12),
        ("", 10),
        (f"Name: {student.name}    Roll No: {student.roll_no}", 11),
        (f"Department: {student.department}    Semester: {semester.label}", 11),
        ("", 10),
    ]
    lines += [(f"{name:<40} {score:>3} / 100", 11) for name, score in marks.items()]
    lines += [("", 10), (f"SGPA: {sgpa:.2f}", 13)]

    text, y = [], 780
    for content, size in lines:
        escaped = content.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        text.append(f"BT /F1 {size} Tf 60 {y} Td ({escaped}) Tj ET")
        y -= size + 10
    stream = "\n".join(text).encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


def marks_for(sgpa: float, count: int, weak: dict[int, int] | None = None) -> list[int]:
    """Plausible final marks out of 100 around an SGPA, with optional overrides."""
    base = round(sgpa * 9.5)
    offsets = [3, -4, 6, -2]
    marks = [max(0, min(100, base + offsets[i % 4])) for i in range(count)]
    for index, value in (weak or {}).items():
        marks[index] = value
    return marks


# --- the seed -------------------------------------------------------------------


class Demo:
    def __init__(self, db: Session, password: str, now: datetime):
        self.db = db
        self.now = now
        self.password_hash = hash_password(password)

    # users and allocations

    def user(
        self, name: str, email: str, role: UserRole, status=UserStatus.active, joined_days_ago: int = 400, **fields
    ) -> User:
        user = User(
            name=name,
            email=email,
            password_hash=self.password_hash,
            role=role,
            status=status,
            created_at=self.now - timedelta(days=joined_days_ago),
            **fields,
        )
        self.db.add(user)
        self.db.flush()
        return user

    def student(self, plan: StudentPlan) -> User:
        return self.user(
            plan.name,
            f"{plan.key}@gec.ac.in",
            UserRole.student,
            roll_no=plan.roll_no,
            department=plan.department,
            year=plan.year,
            division=plan.division,
        )

    def allocate(self, student: User, mentor: User, admin: User, days_ago: int, ended_days_ago: int | None = None):
        allocation = Allocation(
            student_id=student.id,
            mentor_id=mentor.id,
            assigned_by=admin.id,
            status=AllocationStatus.ended if ended_days_ago else AllocationStatus.active,
            start_date=self.now - timedelta(days=days_ago),
            ended_at=self.now - timedelta(days=ended_days_ago) if ended_days_ago else None,
            created_at=self.now - timedelta(days=days_ago),
        )
        self.db.add(allocation)
        self.db.flush()
        log_action(
            self.db,
            actor_id=admin.id,
            action="allocation.create",
            entity="allocation",
            entity_id=allocation.id,
            details=f"student {student.id} -> mentor {mentor.id}",
        )
        return allocation

    # academic records

    def _backdate_flags(self, flags: list[Flag], when: datetime) -> list[Flag]:
        for flag in flags:
            flag.raised_at = when
        self.db.flush()
        return flags

    def internals(
        self,
        student: User,
        semester: Semester,
        subjects: list[str],
        marks: list[tuple],
        *,
        verified_by: User | None,
        days_ago: int,
        max_per_test: int = 20,
    ) -> list[Flag]:
        """Submit internals; verify them through the engine when verified_by is set."""
        submitted = self.now - timedelta(days=days_ago)
        submission = InternalSubmission(
            student_id=student.id,
            semester_id=semester.id,
            status=SubmissionStatus.pending,
            submitted_at=submitted,
        )
        self.db.add(submission)
        self.db.flush()
        for name, (i1, i2, i3) in zip(subjects, marks):
            self.db.add(
                InternalMark(
                    submission_id=submission.id,
                    subject_name=name,
                    max_per_test=max_per_test,
                    i1=i1,
                    i2=i2,
                    i3=i3,
                )
            )
        self.db.flush()
        self.db.refresh(submission)
        if verified_by is None:
            return []

        verified_at = submitted + timedelta(days=2)
        for mark in submission.marks:
            mark.effective_internal = Decimal(
                str(round(flag_engine.compute_effective(mark.i1, mark.i2, mark.i3), 2))
            )
        submission.status = SubmissionStatus.verified
        submission.verified_by = verified_by.id
        submission.verified_at = verified_at
        flags = flag_engine.on_internal_verified(self.db, submission)
        log_action(
            self.db,
            actor_id=verified_by.id,
            action="internal_submission.verify",
            entity="internal_submission",
            entity_id=submission.id,
            details=f"flags raised: {len(flags)}",
        )
        return self._backdate_flags(flags, verified_at)

    def result(
        self,
        student: User,
        semester: Semester,
        sgpa: float,
        subjects: list[str],
        marks: list[int],
        *,
        verified_by: User | None,
        days_ago: int,
    ) -> list[Flag]:
        submitted = self.now - timedelta(days=days_ago)
        scores = dict(zip(subjects, marks))
        proof = save_proof("result.pdf", result_pdf(student, semester, sgpa, scores))
        result = SemesterResult(
            student_id=student.id,
            semester_id=semester.id,
            sgpa=Decimal(str(sgpa)),
            status=SubmissionStatus.pending,
            proof_url=proof,
            submitted_at=submitted,
        )
        self.db.add(result)
        self.db.flush()
        for name, score in scores.items():
            self.db.add(ResultSubject(result_id=result.id, subject_name=name, final_marks=score, max_marks=100))
        self.db.flush()
        self.db.refresh(result)
        if verified_by is None:
            return []

        verified_at = submitted + timedelta(days=3)
        result.status = SubmissionStatus.verified
        result.verified_by = verified_by.id
        result.verified_at = verified_at
        flags = flag_engine.on_result_verified(self.db, result)
        log_action(
            self.db,
            actor_id=verified_by.id,
            action="semester_result.verify",
            entity="semester_result",
            entity_id=result.id,
            details=f"flags raised: {len(flags)}",
        )
        return self._backdate_flags(flags, verified_at)

    # meetings

    def slot(self, mentor: User, start: datetime, minutes: int = 30, status=SlotStatus.open) -> Slot:
        slot = Slot(
            mentor_id=mentor.id,
            start_time=start,
            end_time=start + timedelta(minutes=minutes),
            status=status,
            created_at=min(start, self.now) - timedelta(days=3),
        )
        self.db.add(slot)
        self.db.flush()
        return slot

    def meeting(
        self,
        mentor: User,
        student: User,
        start: datetime,
        agenda: str,
        *,
        minutes: str | None = None,
        flags: list[Flag] = (),
        invited: bool = False,
    ) -> Meeting:
        held = minutes is not None
        slot = self.slot(mentor, start, status=SlotStatus.completed if held else SlotStatus.booked)
        meeting = Meeting(
            slot_id=slot.id,
            student_id=student.id,
            agenda=agenda,
            minutes=minutes,
            status=MeetingStatus.completed if held else MeetingStatus.scheduled,
            invited_by_mentor=invited,
            created_at=slot.created_at,
            completed_at=start + timedelta(minutes=30) if held else None,
            # Past meetings have had their reminders.
            rem_24_sent=held,
            rem_1h_sent=held,
        )
        self.db.add(meeting)
        self.db.flush()
        for flag in flags:
            self.db.add(MeetingFlag(meeting_id=meeting.id, flag_id=flag.id))
        flag_engine.start_discussion(self.db, list(flags))
        if held:
            log_action(
                self.db,
                actor_id=mentor.id,
                action="meeting.complete",
                entity="meeting",
                entity_id=meeting.id,
                details=f"linked flags: {[flag.id for flag in flags]}",
            )
        return meeting

    def resolve(self, flag: Flag, note: str, by: User, when: datetime) -> None:
        flag_engine.resolve_flag(self.db, flag, note, by)
        flag.resolved_at = when
        log_action(self.db, actor_id=by.id, action="flag.resolve", entity="flag", entity_id=flag.id, details=note)
        self.db.flush()

    def group_session(
        self,
        mentor: User,
        title: str,
        start: datetime,
        audience: GroupSessionAudience,
        students: list[User],
        *,
        agenda: str | None = None,
        minutes: str | None = None,
        present: set[int] = frozenset(),
    ) -> GroupSession:
        held = minutes is not None
        session = GroupSession(
            mentor_id=mentor.id,
            title=title,
            agenda=agenda,
            minutes=minutes,
            audience=audience,
            start_time=start,
            end_time=start + timedelta(hours=1),
            status=GroupSessionStatus.completed if held else GroupSessionStatus.scheduled,
            created_at=min(start, self.now) - timedelta(days=5),
            rem_24_sent=held,
            rem_1h_sent=held,
        )
        self.db.add(session)
        self.db.flush()
        for student in students:
            self.db.add(
                GroupAttendance(
                    session_id=session.id,
                    student_id=student.id,
                    attended=(student.id in present) if held else None,
                )
            )
        self.db.flush()
        return session


def build_demo(db: Session, password: str = DEFAULT_PASSWORD, now: datetime | None = None) -> bool:
    """Create the demo scenario. Returns False if it already exists."""
    if db.scalar(select(User.id).where(User.email == COORDINATOR_EMAIL)) is not None:
        return False

    now = now or utcnow()
    demo = Demo(db, password, now)

    # --- people ---------------------------------------------------------------
    shweta = demo.user(
        "Shweta Kamat", COORDINATOR_EMAIL, UserRole.admin, phone="9822012345", joined_days_ago=700
    )
    desai = demo.user(
        "Anjali Desai", "anjali.desai@gec.ac.in", UserRole.mentor,
        department="Computer", designation="Associate Professor", phone="9823098765",
    )
    gaonkar = demo.user(
        "Sunil Gaonkar", "sunil.gaonkar@gec.ac.in", UserRole.mentor,
        department="Computer", designation="Assistant Professor",
    )
    fernandes = demo.user(
        "Maria Fernandes", "maria.fernandes@gec.ac.in", UserRole.mentor,
        department="Mechanical", designation="Professor",
    )
    rao = demo.user(
        "Prakash Rao", "prakash.rao@gec.ac.in", UserRole.mentor, status=UserStatus.deactivated,
        department="Computer", designation="Professor", joined_days_ago=1500,
    )
    demo.user(
        "Neha Prabhu", "neha.prabhu@gec.ac.in", UserRole.mentor, status=UserStatus.pending,
        department="Computer", designation="Assistant Professor", joined_days_ago=2,
    )

    plans = {
        "rohan": StudentPlan("rohan.naik", "Rohan Naik", "23CE045", 2, "A", sgpa_a=8.2, sgpa_b=6.4),
        "priya": StudentPlan("priya.shet", "Priya Shet", "23CE051", 2, "A", sgpa_a=7.9, sgpa_b=7.1),
        "akash": StudentPlan("akash.gawas", "Akash Gawas", "23CE012", 2, "A", sgpa_a=6.6, sgpa_b=5.7),
        "sneha": StudentPlan("sneha.parab", "Sneha Parab", "23CE060", 2, "B", sgpa_a=9.1, sgpa_b=9.3),
        "kevin": StudentPlan("kevin.dsouza", "Kevin D'Souza", "23CE028", 2, "B", sgpa_a=7.4, sgpa_b=7.0),
        "siddhi": StudentPlan("siddhi.naik", "Siddhi Naik", "23CE047", 2, "B", sgpa_a=8.0, sgpa_b=8.4),
        "tanvi": StudentPlan("tanvi.borkar", "Tanvi Borkar", "22CE033", 3, "A", sgpa_a=8.6, sgpa_b=8.8),
        "omkar": StudentPlan("omkar.sawant", "Omkar Sawant", "22CE041", 3, "A", sgpa_a=7.2, sgpa_b=7.5),
        "pooja": StudentPlan("pooja.dessai", "Pooja Dessai", "22CE019", 3, "B", sgpa_a=8.1, sgpa_b=7.8),
        "ritika": StudentPlan("ritika.shirodkar", "Ritika Shirodkar", "22CE055", 3, "B", sgpa_a=7.7, sgpa_b=7.9),
        "aditya": StudentPlan("aditya.kerkar", "Aditya Kerkar", "22CE023", 3, "A", sgpa_a=6.9, sgpa_b=7.3),
        "yash": StudentPlan("yash.gaude", "Yash Gaude", "23ME014", 2, "A", "Mechanical", 7.6, 7.4),
        "neil": StudentPlan("neil.pereira", "Neil Pereira", "23ME031", 2, "A", "Mechanical", 8.3, 8.1),
    }
    s = {key: demo.student(plan) for key, plan in plans.items()}

    # --- semesters ------------------------------------------------------------
    labels = semester_labels(now.astimezone(IST).date())
    sem_a = Semester(
        label=labels[0][0], start_date=labels[0][1], status=SemesterStatus.closed,
        internal_deadline=at(-370, 23, 59, now), result_deadline=at(-290, 23, 59, now),
        created_at=now - timedelta(days=480),
    )
    sem_b = Semester(
        label=labels[1][0], start_date=labels[1][1], status=SemesterStatus.closed,
        internal_deadline=at(-190, 23, 59, now), result_deadline=at(-60, 23, 59, now),
        created_at=now - timedelta(days=300),
    )
    sem_c = Semester(
        label=labels[2][0], start_date=labels[2][1], status=SemesterStatus.open,
        internal_deadline=at(-12, 23, 59, now), result_deadline=at(45, 23, 59, now),
        created_at=now - timedelta(days=120),
    )
    db.add_all([sem_a, sem_b, sem_c])
    db.flush()

    # --- allocations ----------------------------------------------------------
    desai_mentees = [s[k] for k in ("rohan", "priya", "akash", "sneha", "kevin", "siddhi")]
    for student in desai_mentees:
        demo.allocate(student, desai, shweta, days_ago=420)
    for key in ("tanvi", "omkar", "pooja"):
        demo.allocate(s[key], gaonkar, shweta, days_ago=780)
    for key in ("yash", "neil"):
        demo.allocate(s[key], fernandes, shweta, days_ago=420)
    for key in ("ritika", "aditya"):
        demo.allocate(s[key], rao, shweta, days_ago=780, ended_days_ago=20)

    def mentor_of(key: str) -> User:
        if key in ("tanvi", "omkar", "pooja"):
            return gaonkar
        if key in ("yash", "neil"):
            return fernandes
        if key in ("ritika", "aditya"):
            return rao
        return desai

    # --- history: two complete, verified semesters for everyone ----------------
    raised: dict[str, list[Flag]] = {}
    for key, plan in plans.items():
        student, mentor = s[key], mentor_of(key)
        subjects = MECH_SUBJECTS if plan.department == "Mechanical" else SUBJECTS
        steady = [(15, 16, 14), (14, 17, 15), (16, 15, 17), (13, 16, 15)]
        demo.internals(student, sem_a, subjects["A"], steady, verified_by=mentor, days_ago=375)
        demo.result(
            student, sem_a, plan.sgpa_a, subjects["A"], marks_for(plan.sgpa_a, 4),
            verified_by=mentor, days_ago=295,
        )
        demo.internals(student, sem_b, subjects["B"], steady, verified_by=mentor, days_ago=195)
        if key == "rohan":
            continue  # Rohan's semester B result is the live demo, below.
        weak = {2: 35} if key == "priya" else None
        raised[key] = demo.result(
            student, sem_b, plan.sgpa_b, subjects["B"], marks_for(plan.sgpa_b, 4, weak),
            verified_by=mentor, days_ago=25 if key == "akash" else 70,
        )

    # Rohan uploaded his 6.4 late; it waits for Prof. Desai. Verifying it fires F1.
    demo.result(
        s["rohan"], sem_b, 6.4, SUBJECTS["B"], [61, 58, 66, 52], verified_by=None, days_ago=2,
    )

    # --- current semester internals --------------------------------------------
    current_marks = [(16, 17, None), (15, 18, None), (14, 16, None), (17, 15, None)]
    for key, plan in plans.items():
        if key in ("akash", "kevin", "priya"):
            continue
        subjects = MECH_SUBJECTS if plan.department == "Mechanical" else SUBJECTS
        verifier = None if key in ("ritika", "aditya", "siddhi") else mentor_of(key)
        demo.internals(s[key], sem_c, subjects["C"], current_marks, verified_by=verifier, days_ago=18)
    # Priya's are waiting for verification; Kevin's weak internals raise F4.
    demo.internals(s["priya"], sem_c, SUBJECTS["C"], current_marks, verified_by=None, days_ago=13)
    kevin_f4 = demo.internals(
        s["kevin"], sem_c, SUBJECTS["C"],
        [(6, 9, None), (12, 13, None), (7, 5, None), (14, 15, None)],
        verified_by=desai, days_ago=10,
    )

    # --- meetings ---------------------------------------------------------------
    (priya_f2,) = [f for f in raised["priya"] if f.rule == FlagRule.F2]
    demo.meeting(
        desai, s["priya"], at(-62, 11, 0, now), "Operating Systems result and re-exam plan",
        minutes=(
            "Discussed the Operating Systems score (35). Priya missed two weeks of classes in "
            "the second half of the semester due to illness. Agreed: she registers for the "
            "supplementary exam, attends the department's remedial sessions, and shares her "
            "study timetable with me by Friday."
        ),
        flags=[priya_f2],
        invited=True,
    )
    demo.resolve(
        priya_f2,
        "Supplementary exam registered; remedial classes attended. Follow-up in the next review.",
        desai,
        at(-55, 16, 30, now),
    )
    demo.meeting(
        desai, s["sneha"], at(-40, 15, 0, now), "Guidance on internship applications",
        minutes="Reviewed Sneha's CV and shortlisted three summer research internships to apply for.",
    )
    demo.meeting(
        gaonkar, s["omkar"], at(-21, 12, 0, now), "Elective selection for next semester",
        minutes="Talked through elective options. Omkar is leaning towards Machine Learning.",
    )
    demo.meeting(
        desai, s["kevin"], at(2, 11, 0, now),
        "Low internal marks in Computer Networks and Software Engineering",
    )
    for days, hour, minute in ((1, 15, 0), (3, 10, 30), (3, 11, 0), (5, 16, 0)):
        demo.slot(desai, at(days, hour, minute, now))
    demo.slot(gaonkar, at(2, 14, 0, now))

    # --- group sessions ----------------------------------------------------------
    demo.group_session(
        desai, "Planning for end-semester examinations", at(-24, 16, 0, now),
        GroupSessionAudience.all, desai_mentees,
        agenda="Exam timetable, revision planning, and how to approach previous papers.",
        minutes="Shared a revision timetable template. Most students plan to start revision two weeks out.",
        present={s[k].id for k in ("rohan", "priya", "sneha", "siddhi", "kevin")},
    )
    demo.group_session(
        desai, "Catching up on internals", at(6, 16, 0, now), GroupSessionAudience.flagged,
        [s["akash"], s["kevin"]],
        agenda="A plan to recover marks before the final internal test.",
    )

    # --- akash: F3 raised 25 days ago, never discussed ---------------------------
    for flag in raised["akash"]:
        flag.raised_at = now - timedelta(days=21)
    db.flush()

    # The real daily job: F5 for Akash's missing internals, then escalation of
    # every open flag older than 14 days (Akash's F3).
    db.commit()
    run_daily_jobs(db, now)
    assert kevin_f4, "Kevin's internals should have raised F4"
    return True


def main() -> int:
    if os.environ.get("SEED_DEMO") != "1":
        print("Refusing to run: set SEED_DEMO=1 to load the demo data into this database.")
        return 1
    password = os.environ.get("DEMO_PASSWORD") or DEFAULT_PASSWORD

    with SessionLocal() as db:
        created = build_demo(db, password)

    if not created:
        print("Demo data is already loaded; nothing changed.")
        return 0

    print("Demo data loaded. Every account uses the password:", password)
    print()
    print("  Coordinator (admin)  shweta.kamat@gec.ac.in")
    print("  Mentor               anjali.desai@gec.ac.in")
    print("  Mentor               sunil.gaonkar@gec.ac.in")
    print("  Student              rohan.naik@gec.ac.in")
    print("  Student              kevin.dsouza@gec.ac.in")
    print("  Pending mentor       neha.prabhu@gec.ac.in (approve as Shweta)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
