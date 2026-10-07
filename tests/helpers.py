"""Payload builders and request helpers shared by the API tests."""

from datetime import date
from decimal import Decimal
from functools import lru_cache

from app.core.security import hash_password
from app.models.academics import (
    InternalMark,
    InternalSubmission,
    ResultSubject,
    Semester,
    SemesterResult,
)
from app.models.enums import AllocationStatus, SubmissionStatus, UserRole, UserStatus
from app.models.user import Allocation, User
from app.services.flag_engine import compute_effective

PASSWORD = "s3cret-pass"
ADMIN_EMAIL = "admin@gec.ac.in"
ADMIN_PASSWORD = "admin-pass-123"


def student_payload(**overrides) -> dict:
    payload = {
        "name": "Rohan Naik",
        "email": "rohan@gec.ac.in",
        "password": PASSWORD,
        "role": "student",
        "department": "Computer",
        "roll_no": "23CE045",
        "year": 2,
        "division": "A",
    }
    payload.update(overrides)
    return payload


def mentor_payload(**overrides) -> dict:
    payload = {
        "name": "Anjali Desai",
        "email": "anjali@gec.ac.in",
        "password": PASSWORD,
        "role": "mentor",
        "department": "Mechanical",
        "designation": "Associate Professor",
    }
    payload.update(overrides)
    return payload


def register(client, payload: dict):
    return client.post("/api/v1/auth/register", json=payload)


def login(client, email: str, password: str = PASSWORD):
    return client.post(
        "/api/v1/auth/login", data={"username": email, "password": password}
    )


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login_headers(client, email: str, password: str = PASSWORD) -> dict:
    response = login(client, email, password)
    assert response.status_code == 200, response.text
    return auth_header(response.json()["access_token"])


def allocate(db, student: User, mentor: User) -> Allocation:
    allocation = Allocation(
        student_id=student.id,
        mentor_id=mentor.id,
        assigned_by=mentor.id,
        status=AllocationStatus.active,
    )
    db.add(allocation)
    db.commit()
    return allocation


def make_semester(db, label: str, start_date: date | None = None, **fields) -> Semester:
    semester = Semester(label=label, start_date=start_date, **fields)
    db.add(semester)
    db.commit()
    return semester


def make_internal(
    db,
    student: User,
    semester: Semester,
    subjects: dict[str, tuple],
    *,
    max_per_test: int = 20,
    status: SubmissionStatus = SubmissionStatus.verified,
    verified_by: int | None = None,
) -> InternalSubmission:
    """subjects maps subject name -> (i1, i2, i3). Effective is precomputed."""
    submission = InternalSubmission(
        student_id=student.id,
        semester_id=semester.id,
        status=status,
        verified_by=verified_by,
    )
    db.add(submission)
    db.flush()
    for name, (i1, i2, i3) in subjects.items():
        db.add(
            InternalMark(
                submission_id=submission.id,
                subject_name=name,
                max_per_test=max_per_test,
                i1=i1,
                i2=i2,
                i3=i3,
                effective_internal=compute_effective(i1, i2, i3),
            )
        )
    db.commit()
    return submission


def make_result(
    db,
    student: User,
    semester: Semester,
    sgpa,
    subjects: dict[str, int] | None = None,
    *,
    status: SubmissionStatus = SubmissionStatus.verified,
    verified_by: int | None = None,
) -> SemesterResult:
    """subjects maps subject name -> final_marks (out of 100)."""
    result = SemesterResult(
        student_id=student.id,
        semester_id=semester.id,
        sgpa=Decimal(str(sgpa)),
        status=status,
        proof_url="proofs/test.pdf",
        verified_by=verified_by,
    )
    db.add(result)
    db.flush()
    for name, marks in (subjects or {"Maths": 70}).items():
        db.add(
            ResultSubject(
                result_id=result.id, subject_name=name, final_marks=marks, max_marks=100
            )
        )
    db.commit()
    return result


@lru_cache
def _password_hash() -> str:
    # bcrypt is slow on purpose; hash the shared test password only once.
    return hash_password(PASSWORD)


def make_user(db, key: str, role: UserRole, **overrides) -> User:
    """Insert a user straight into the DB (fast path; password is PASSWORD)."""
    fields = {
        "name": key.title(),
        "email": f"{key}@gec.ac.in",
        "password_hash": _password_hash(),
        "role": role,
        "status": UserStatus.active,
        "department": "Computer",
    }
    if role == UserRole.student:
        fields.update(roll_no=key.upper(), year=2, division="A")
    elif role == UserRole.mentor:
        fields.update(designation="Assistant Professor")
    fields.update(overrides)

    user = User(**fields)
    db.add(user)
    db.commit()
    return user
