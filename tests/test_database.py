import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.models import Allocation, InternalSubmission, Semester, User
from app.models.enums import AllocationStatus, SubmissionStatus, UserRole, UserStatus
from app.models.types import utcnow

EXPECTED_TABLES = {
    "users",
    "allocations",
    "semesters",
    "internal_submissions",
    "internal_marks",
    "semester_results",
    "result_subjects",
    "flags",
    "slots",
    "meetings",
    "meeting_flags",
    "group_sessions",
    "group_attendance",
    "notifications",
    "audit_log",
}

# table -> (index name, fragment the WHERE clause must contain)
PARTIAL_INDEXES = {
    "allocations": ("uq_one_active_allocation", "status = 'active'"),
    "internal_submissions": (
        "uq_one_live_internal_submission",
        "status IN ('pending', 'verified')",
    ),
    "semester_results": (
        "uq_one_live_semester_result",
        "status IN ('pending', 'verified')",
    ),
    "flags": (
        "uq_one_unresolved_flag",
        "status IN ('open', 'in_discussion', 'escalated')",
    ),
    "meetings": ("uq_one_live_meeting_per_slot", "status IN ('scheduled', 'completed')"),
}


def make_user(db, email, role, **extra):
    user = User(
        name=email.split("@")[0],
        email=email,
        password_hash="not-a-real-hash",
        role=role,
        status=UserStatus.active,
        department="Computer",
        **extra,
    )
    db.add(user)
    db.flush()
    return user


def test_all_15_tables_exist(engine):
    tables = set(inspect(engine).get_table_names()) - {"alembic_version"}
    assert tables == EXPECTED_TABLES


def test_partial_unique_indexes_present(engine):
    inspector = inspect(engine)
    for table, (index_name, where) in PARTIAL_INDEXES.items():
        indexes = {ix["name"]: ix for ix in inspector.get_indexes(table)}
        assert index_name in indexes, f"{index_name} missing on {table}"
        index = indexes[index_name]
        assert index["unique"], f"{index_name} is not unique"
        # A plain unique index would have no WHERE clause at all.
        predicate = str(index.get("dialect_options", {}).get("sqlite_where", ""))
        assert where in predicate, f"{index_name} is not partial: {predicate!r}"


def test_meeting_flags_has_composite_pk_and_no_id(engine):
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("meeting_flags")}
    assert columns == {"meeting_id", "flag_id"}
    pk = inspector.get_pk_constraint("meeting_flags")
    assert set(pk["constrained_columns"]) == {"meeting_id", "flag_id"}


def test_every_foreign_key_is_on_delete_restrict(engine):
    inspector = inspect(engine)
    total = 0
    for table in EXPECTED_TABLES:
        for fk in inspector.get_foreign_keys(table):
            total += 1
            assert fk["options"].get("ondelete") == "RESTRICT", (table, fk)
    assert total == 24


def test_second_active_allocation_for_same_student_is_rejected(db):
    admin = make_user(db, "admin@gec.ac.in", UserRole.admin)
    mentor_a = make_user(db, "a@gec.ac.in", UserRole.mentor)
    mentor_b = make_user(db, "b@gec.ac.in", UserRole.mentor)
    student = make_user(db, "s@gec.ac.in", UserRole.student, roll_no="21CE01")

    db.add(
        Allocation(
            student_id=student.id,
            mentor_id=mentor_a.id,
            assigned_by=admin.id,
            status=AllocationStatus.active,
        )
    )
    db.commit()

    db.add(
        Allocation(
            student_id=student.id,
            mentor_id=mentor_b.id,
            assigned_by=admin.id,
            status=AllocationStatus.active,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()


def test_reassignment_keeps_history(db):
    """Ending the old allocation frees the student for a new active one."""
    admin = make_user(db, "admin@gec.ac.in", UserRole.admin)
    mentor_a = make_user(db, "a@gec.ac.in", UserRole.mentor)
    mentor_b = make_user(db, "b@gec.ac.in", UserRole.mentor)
    student = make_user(db, "s@gec.ac.in", UserRole.student, roll_no="21CE01")

    old = Allocation(
        student_id=student.id,
        mentor_id=mentor_a.id,
        assigned_by=admin.id,
        status=AllocationStatus.active,
    )
    db.add(old)
    db.commit()

    old.status = AllocationStatus.ended
    old.ended_at = utcnow()
    db.add(
        Allocation(
            student_id=student.id,
            mentor_id=mentor_b.id,
            assigned_by=admin.id,
            status=AllocationStatus.active,
        )
    )
    db.commit()

    assert db.query(Allocation).filter_by(student_id=student.id).count() == 2


def test_rejected_submission_allows_resubmission(db):
    """Rejected rows are history; only one live submission per (student, semester)."""
    student = make_user(db, "s@gec.ac.in", UserRole.student, roll_no="21CE01")
    semester = Semester(label="2026-27 Odd")
    db.add(semester)
    db.flush()

    def submission(status):
        return InternalSubmission(
            student_id=student.id,
            semester_id=semester.id,
            status=status,
        )

    db.add_all([submission(SubmissionStatus.rejected), submission(SubmissionStatus.rejected)])
    db.add(submission(SubmissionStatus.pending))
    db.commit()

    db.add(submission(SubmissionStatus.pending))
    with pytest.raises(IntegrityError):
        db.commit()


def test_datetimes_round_trip_timezone_aware(db):
    user = make_user(db, "tz@gec.ac.in", UserRole.mentor)
    db.commit()
    db.expire_all()
    assert db.get(User, user.id).created_at.tzinfo is not None
