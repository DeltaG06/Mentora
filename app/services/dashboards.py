"""Read-only dashboard queries (contract Module 11).

Nothing here writes. Aggregation that differs between SQLite and PostgreSQL
(date bucketing, interval maths) is done in Python so it stays portable.
"""

from collections import Counter
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.academics import InternalSubmission, Semester, SemesterResult
from app.models.enums import (
    AllocationStatus,
    FlagRule,
    FlagStatus,
    GroupSessionStatus,
    MeetingStatus,
    SemesterStatus,
    SubmissionStatus,
    UserRole,
    UserStatus,
)
from app.models.flag import Flag
from app.models.meeting import GroupAttendance, GroupSession, Meeting, Slot
from app.models.user import Allocation, User
from app.services.allocations import active_mentee_ids, get_active_allocation
from app.services.flag_engine import LIVE_SUBMISSION_STATUSES, UNRESOLVED_STATUSES

GREEN, RED, AMBER = "green", "red", "amber"


def semester_order_key(semester: Semester) -> tuple:
    """Chronological order: by start_date, then id; undated semesters last."""
    return (semester.start_date is None, semester.start_date or date.min, semester.id)


def flag_indicator(statuses: list[FlagStatus]) -> str:
    if FlagStatus.escalated in statuses:
        return AMBER
    if any(status in UNRESOLVED_STATUSES for status in statuses):
        return RED
    return GREEN


def _flag_counts(rows) -> dict[str, int]:
    counts = {status.value: 0 for status in FlagStatus}
    for status, count in rows:
        counts[status.value] = count
    return counts


def _verified(db: Session, model, student_ids) -> list:
    records = db.scalars(
        select(model).where(
            model.student_id.in_(student_ids),
            model.status == SubmissionStatus.verified,
        )
    ).all()
    return sorted(records, key=lambda record: semester_order_key(record.semester))


# --- mentor -----------------------------------------------------------------


def mentor_dashboard(db: Session, mentor: User, now: datetime) -> dict:
    mentee_ids = active_mentee_ids(mentor.id)
    mentees = db.scalars(
        select(User).where(User.id.in_(mentee_ids)).order_by(User.name, User.id)
    ).all()

    statuses: dict[int, list[FlagStatus]] = {mentee.id: [] for mentee in mentees}
    for student_id, status in db.execute(
        select(Flag.student_id, Flag.status).where(
            Flag.student_id.in_(mentee_ids), Flag.status.in_(UNRESOLVED_STATUSES)
        )
    ):
        statuses.setdefault(student_id, []).append(status)

    # Verified results in semester order, so the last one per student wins.
    latest_sgpa: dict[int, float] = {}
    for result in _verified(db, SemesterResult, mentee_ids):
        latest_sgpa[result.student_id] = float(result.sgpa)

    roster = [
        {
            "student": mentee,
            "latest_sgpa": latest_sgpa.get(mentee.id),
            "unresolved_flags": len(statuses[mentee.id]),
            "indicator": flag_indicator(statuses[mentee.id]),
        }
        for mentee in mentees
    ]

    def pending(model) -> int:
        return db.scalar(
            select(func.count()).where(
                model.student_id.in_(mentee_ids),
                model.status == SubmissionStatus.pending,
            )
        )

    upcoming_meetings = db.scalar(
        select(func.count())
        .select_from(Meeting)
        .join(Slot)
        .where(
            Slot.mentor_id == mentor.id,
            Meeting.status == MeetingStatus.scheduled,
            Slot.start_time >= now,
        )
    )
    upcoming_sessions = db.scalar(
        select(func.count()).where(
            GroupSession.mentor_id == mentor.id,
            GroupSession.status == GroupSessionStatus.scheduled,
            GroupSession.start_time >= now,
        )
    )
    return {
        "mentees": roster,
        "pending_internal_submissions": pending(InternalSubmission),
        "pending_results": pending(SemesterResult),
        "upcoming_meetings": upcoming_meetings,
        "upcoming_group_sessions": upcoming_sessions,
    }


def mentee_detail(db: Session, mentor: User, student: User) -> dict:
    ids = [student.id]
    flags = db.scalars(
        select(Flag)
        .where(Flag.student_id == student.id)
        .order_by(Flag.raised_at.desc(), Flag.id.desc())
    ).all()
    meetings = db.scalars(
        select(Meeting)
        .join(Slot)
        .where(Meeting.student_id == student.id, Slot.mentor_id == mentor.id)
        .order_by(Slot.start_time, Meeting.id)
    ).all()
    return {
        "student": student,
        "results": _verified(db, SemesterResult, ids),
        "internal_submissions": _verified(db, InternalSubmission, ids),
        "flags": flags,
        "meetings": meetings,
    }


# --- student ----------------------------------------------------------------


def _next_deadline(db: Session, student: User, now: datetime) -> dict | None:
    candidates = []
    for semester in db.scalars(
        select(Semester).where(Semester.status == SemesterStatus.open)
    ):
        for kind, deadline, model in (
            ("internal", semester.internal_deadline, InternalSubmission),
            ("result", semester.result_deadline, SemesterResult),
        ):
            if deadline is not None and deadline > now:
                candidates.append((deadline, semester.id, kind, semester, model))
    if not candidates:
        return None

    deadline, _, kind, semester, model = min(candidates, key=lambda c: c[:3])
    submitted = db.scalar(
        select(func.count()).where(
            model.student_id == student.id,
            model.semester_id == semester.id,
            model.status.in_(LIVE_SUBMISSION_STATUSES),
        )
    )
    return {
        "semester": semester,
        "kind": kind,
        "deadline": deadline,
        "submitted": bool(submitted),
    }


def student_dashboard(db: Session, student: User, now: datetime) -> dict:
    allocation = get_active_allocation(db, student.id)

    counts = _flag_counts(
        db.execute(
            select(Flag.status, func.count())
            .where(Flag.student_id == student.id)
            .group_by(Flag.status)
        )
    )
    active_flags = db.scalars(
        select(Flag)
        .where(Flag.student_id == student.id, Flag.status.in_(UNRESOLVED_STATUSES))
        .order_by(Flag.raised_at.desc(), Flag.id.desc())
    ).all()
    meetings = db.scalars(
        select(Meeting)
        .join(Slot)
        .where(
            Meeting.student_id == student.id,
            Meeting.status == MeetingStatus.scheduled,
            Slot.start_time >= now,
        )
        .order_by(Slot.start_time, Meeting.id)
    ).all()
    sessions = db.scalars(
        select(GroupSession)
        .join(GroupAttendance)
        .where(
            GroupAttendance.student_id == student.id,
            GroupSession.status == GroupSessionStatus.scheduled,
            GroupSession.start_time >= now,
        )
        .order_by(GroupSession.start_time, GroupSession.id)
    ).all()

    return {
        "mentor": allocation.mentor if allocation is not None else None,
        "sgpa_trend": [
            {"semester": result.semester, "sgpa": float(result.sgpa)}
            for result in _verified(db, SemesterResult, [student.id])
        ],
        "flag_counts": counts,
        "active_flags": active_flags,
        "upcoming_meetings": meetings,
        "upcoming_group_sessions": sessions,
        "next_deadline": _next_deadline(db, student, now),
    }


# --- admin ------------------------------------------------------------------


def _count_users(db: Session, role: UserRole, status: UserStatus) -> int:
    return db.scalar(
        select(func.count()).where(User.role == role, User.status == status)
    )


def admin_dashboard(db: Session, semester_id: int | None) -> dict:
    active_students = _count_users(db, UserRole.student, UserStatus.active)
    allocated = db.scalar(
        select(func.count(func.distinct(Allocation.student_id)))
        .select_from(Allocation)
        .join(User, User.id == Allocation.student_id)
        .where(
            Allocation.status == AllocationStatus.active,
            User.status == UserStatus.active,
        )
    )
    coverage = round(allocated / active_students * 100, 1) if active_students else 0.0

    flag_filter = [] if semester_id is None else [Flag.semester_id == semester_id]
    counts = _flag_counts(
        db.execute(
            select(Flag.status, func.count()).where(*flag_filter).group_by(Flag.status)
        )
    )
    durations = [
        (resolved_at - raised_at).total_seconds()
        for raised_at, resolved_at in db.execute(
            select(Flag.raised_at, Flag.resolved_at).where(
                *flag_filter,
                Flag.status == FlagStatus.resolved,
                Flag.resolved_at.is_not(None),
            )
        )
    ]
    avg_hours = round(sum(durations) / len(durations) / 3600, 1) if durations else None

    return {
        "active_students": active_students,
        "allocated_students": allocated,
        "coverage_percent": coverage,
        "pending_mentors": _count_users(db, UserRole.mentor, UserStatus.pending),
        "flag_counts": counts,
        "avg_resolution_hours": avg_hours,
        "mentors": _mentor_stats(db, flag_filter),
    }


def _mentor_stats(db: Session, flag_filter: list) -> list[dict]:
    mentors = db.scalars(
        select(User)
        .where(User.role == UserRole.mentor, User.status == UserStatus.active)
        .order_by(User.name, User.id)
    ).all()

    active = Allocation.status == AllocationStatus.active
    mentees = dict(
        db.execute(
            select(Allocation.mentor_id, func.count())
            .where(active)
            .group_by(Allocation.mentor_id)
        ).all()
    )
    meetings = Counter()
    for mentor_id, status, count in db.execute(
        select(Slot.mentor_id, Meeting.status, func.count())
        .select_from(Meeting)
        .join(Slot, Slot.id == Meeting.slot_id)
        .group_by(Slot.mentor_id, Meeting.status)
    ):
        meetings[(mentor_id, status)] = count
    sessions = dict(
        db.execute(
            select(GroupSession.mentor_id, func.count())
            .where(GroupSession.status == GroupSessionStatus.completed)
            .group_by(GroupSession.mentor_id)
        ).all()
    )
    flags = dict(
        db.execute(
            select(Allocation.mentor_id, func.count())
            .select_from(Allocation)
            .join(Flag, Flag.student_id == Allocation.student_id)
            .where(active, Flag.status.in_(UNRESOLVED_STATUSES), *flag_filter)
            .group_by(Allocation.mentor_id)
        ).all()
    )

    return [
        {
            "mentor": mentor,
            "active_mentees": mentees.get(mentor.id, 0),
            "meetings_completed": meetings[(mentor.id, MeetingStatus.completed)],
            "meetings_scheduled": meetings[(mentor.id, MeetingStatus.scheduled)],
            "group_sessions_completed": sessions.get(mentor.id, 0),
            "unresolved_flags": flags.get(mentor.id, 0),
        }
        for mentor in mentors
    ]


def analytics(db: Session, semester_id: int | None, weeks: int, now: datetime) -> dict:
    flag_filter = [] if semester_id is None else [Flag.semester_id == semester_id]
    by_rule = dict(
        db.execute(
            select(Flag.rule, func.count()).where(*flag_filter).group_by(Flag.rule)
        ).all()
    )

    this_monday = now.date() - timedelta(days=now.weekday())
    first_monday = this_monday - timedelta(weeks=weeks - 1)
    window_start = datetime.combine(first_monday, datetime.min.time(), now.tzinfo)
    buckets = Counter()
    for (completed_at,) in db.execute(
        select(Meeting.completed_at).where(
            Meeting.status == MeetingStatus.completed,
            Meeting.completed_at >= window_start,
        )
    ):
        day = completed_at.date()
        buckets[day - timedelta(days=day.weekday())] += 1

    return {
        "flags_by_rule": [
            {"rule": rule, "count": by_rule.get(rule, 0)} for rule in FlagRule
        ],
        "meetings_trend": [
            {"week_start": week, "completed": buckets[week]}
            for week in (first_monday + timedelta(weeks=i) for i in range(weeks))
        ],
    }
