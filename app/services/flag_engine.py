"""Flag engine: rules F1-F5, dedup, resolution, escalation, deadline scan.

Pure functions plus database operations; no HTTP concerns. Functions that
write only flush, so the caller (a route or a scheduled job) owns the commit.
"""

from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, object_session

from app.core import flag_config
from app.models.academics import InternalSubmission, Semester, SemesterResult
from app.models.enums import (
    FlagRule,
    FlagStatus,
    SubmissionStatus,
    UserRole,
    UserStatus,
)
from app.models.flag import Flag
from app.models.types import utcnow
from app.models.user import User
from app.services import notifications
from app.services.allocations import get_active_allocation
from app.services.notifications import create_notification

Triggered = list[tuple[FlagRule, str]]

UNRESOLVED_STATUSES = (
    FlagStatus.open,
    FlagStatus.in_discussion,
    FlagStatus.escalated,
)
LIVE_SUBMISSION_STATUSES = (SubmissionStatus.pending, SubmissionStatus.verified)
F5_AUTO_RESOLVE_NOTE = "Auto-resolved: late submission verified"


class EmptyResolutionNote(ValueError):
    """resolve_flag was called without a note."""


class FlagAlreadyResolved(ValueError):
    """resolve_flag was called on a flag that is already resolved."""


# --- pure helpers -----------------------------------------------------------


def compute_effective(i1, i2, i3) -> float:
    """Average of the best two non-null marks (works for 1, 2 or 3 tests)."""
    marks = sorted((m for m in (i1, i2, i3) if m is not None), reverse=True)
    if not marks:
        raise ValueError("at least one internal mark is required")
    best = marks[:2]
    return sum(best) / len(best)


def _dec(value) -> Decimal:
    return Decimal(str(value))


def _fmt(value) -> str:
    """8.20 -> '8.2', 6.00 -> '6.0', 5.99 -> '5.99'."""
    text = f"{_dec(value):.2f}".rstrip("0")
    return text + "0" if text.endswith(".") else text


def _mark_pct(mark) -> float | None:
    """A subject's effective internal as a percentage of max_per_test."""
    if mark.effective_internal is not None:
        effective = float(mark.effective_internal)
    elif any(m is not None for m in (mark.i1, mark.i2, mark.i3)):
        effective = compute_effective(mark.i1, mark.i2, mark.i3)
    else:
        return None
    return effective / mark.max_per_test * 100


def internal_average_pct(submission: InternalSubmission) -> float | None:
    """Mean of the subject percentages (scale-independent)."""
    percentages = [pct for pct in map(_mark_pct, submission.marks) if pct is not None]
    if not percentages:
        return None
    return sum(percentages) / len(percentages)


def _baseline(db: Session, model, student_id: int, semester: Semester):
    """The student's most recent EARLIER verified record of this kind.

    Earlier means a smaller semester.start_date; when this semester has no
    start_date, semester id order is the fallback.
    """
    query = (
        select(model)
        .join(Semester, model.semester_id == Semester.id)
        .where(
            model.student_id == student_id,
            model.status == SubmissionStatus.verified,
        )
    )
    if semester.start_date is not None:
        query = query.where(Semester.start_date < semester.start_date).order_by(
            Semester.start_date.desc(), Semester.id.desc()
        )
    else:
        query = query.where(Semester.id < semester.id).order_by(Semester.id.desc())
    return db.scalars(query.limit(1)).first()


# --- evaluation -------------------------------------------------------------


def evaluate_internal(submission: InternalSubmission) -> Triggered:
    """F4 only. Returns at most one (rule, reason); reasons are joined."""
    reasons = []

    # Sub-trigger A: any subject below the absolute percentage.
    for mark in submission.marks:
        pct = _mark_pct(mark)
        if pct is not None and pct < flag_config.F4_INTERNAL_PCT:
            reasons.append(
                f"Subject '{mark.subject_name}' internal {pct:.1f}% "
                f"(below {flag_config.F4_INTERNAL_PCT:g}%)"
            )

    # Sub-trigger B: semester average dropped vs the baseline. Needs a baseline.
    current = internal_average_pct(submission)
    baseline = _baseline(
        object_session(submission),
        InternalSubmission,
        submission.student_id,
        submission.semester,
    )
    previous = internal_average_pct(baseline) if baseline is not None else None
    if current is not None and previous is not None:
        # Rounded so float noise cannot turn an exact 15-point drop into 14.99...
        if round(previous - current, 6) >= flag_config.F4_INTERNAL_DROP_PTS:
            reasons.append(
                f"Internal average fell from {previous:.1f}% to {current:.1f}%"
            )

    return [(FlagRule.F4, "; ".join(reasons))] if reasons else []


def evaluate_result(result: SemesterResult) -> Triggered:
    """F1, F2, F3. Returns at most one (rule, reason) per rule."""
    triggered: Triggered = []
    sgpa = _dec(result.sgpa)

    # F1: drop vs the most recent earlier verified result. Needs a baseline.
    baseline = _baseline(
        object_session(result), SemesterResult, result.student_id, result.semester
    )
    if baseline is not None:
        previous = _dec(baseline.sgpa)
        if previous - sgpa >= _dec(flag_config.F1_SGPA_DROP):
            triggered.append(
                (FlagRule.F1, f"SGPA fell from {_fmt(previous)} to {_fmt(sgpa)}")
            )

    # F2: any subject's raw final marks below the pass line.
    failed = [
        f"Subject '{subject.subject_name}' marks {subject.final_marks} "
        f"(below {flag_config.F2_SUBJECT_FAIL})"
        for subject in result.subjects
        if subject.final_marks < flag_config.F2_SUBJECT_FAIL
    ]
    if failed:
        triggered.append((FlagRule.F2, "; ".join(failed)))

    # F3: absolute SGPA floor.
    if sgpa < _dec(flag_config.F3_SGPA_ABSOLUTE):
        triggered.append(
            (
                FlagRule.F3,
                f"SGPA {_fmt(sgpa)} (below {_fmt(flag_config.F3_SGPA_ABSOLUTE)})",
            )
        )
    return triggered


# --- raising and resolving --------------------------------------------------


def raise_flags(
    db: Session, student: User, semester: Semester, triggered: Triggered
) -> list[Flag]:
    """Create open flags, skipping any rule that already has an unresolved flag."""
    created = []
    mentor_id = None
    for rule, reason in triggered:
        duplicate = db.scalar(
            select(Flag.id).where(
                Flag.student_id == student.id,
                Flag.semester_id == semester.id,
                Flag.rule == rule,
                Flag.status.in_(UNRESOLVED_STATUSES),
            )
        )
        if duplicate is not None:
            continue
        try:
            # The partial unique index is the final arbiter under concurrency.
            with db.begin_nested():
                flag = Flag(
                    student_id=student.id,
                    semester_id=semester.id,
                    rule=rule,
                    reason=reason,
                    status=FlagStatus.open,
                    raised_at=utcnow(),
                )
                db.add(flag)
                db.flush()
        except IntegrityError:
            continue
        created.append(flag)

        title = f"Flag raised: {rule.value}"
        create_notification(db, student.id, title, reason, notifications.FLAG_RAISED)
        if mentor_id is None:
            allocation = get_active_allocation(db, student.id)
            mentor_id = allocation.mentor_id if allocation else 0
        if mentor_id:
            create_notification(
                db,
                mentor_id,
                title,
                f"{student.name} ({student.roll_no}): {reason}",
                notifications.FLAG_RAISED,
            )
    db.flush()
    return created


def auto_resolve_open_f5(
    db: Session, student: User, semester: Semester, resolved_by: int | None
) -> Flag | None:
    """Resolve the open F5 for (student, semester), if there is one."""
    flag = db.scalar(
        select(Flag).where(
            Flag.student_id == student.id,
            Flag.semester_id == semester.id,
            Flag.rule == FlagRule.F5,
            Flag.status == FlagStatus.open,
        )
    )
    if flag is None:
        return None
    flag.status = FlagStatus.resolved
    flag.resolution_note = F5_AUTO_RESOLVE_NOTE
    flag.resolved_at = utcnow()
    flag.resolved_by = resolved_by
    db.flush()
    return flag


def on_internal_verified(db: Session, submission: InternalSubmission) -> list[Flag]:
    """Call after an internal submission is marked verified. Evaluates F4."""
    db.flush()
    student, semester = submission.student, submission.semester
    created = raise_flags(db, student, semester, evaluate_internal(submission))
    auto_resolve_open_f5(db, student, semester, submission.verified_by)
    return created


def on_result_verified(db: Session, result: SemesterResult) -> list[Flag]:
    """Call after a semester result is marked verified. Evaluates F1, F2, F3."""
    db.flush()
    student, semester = result.student, result.semester
    created = raise_flags(db, student, semester, evaluate_result(result))
    auto_resolve_open_f5(db, student, semester, result.verified_by)
    return created


def resolve_flag(db: Session, flag: Flag, note: str, resolved_by: User) -> Flag:
    if not note or not note.strip():
        raise EmptyResolutionNote("A resolution note is required")
    if flag.status == FlagStatus.resolved:
        raise FlagAlreadyResolved("Flag is already resolved")

    flag.status = FlagStatus.resolved
    flag.resolution_note = note.strip()
    flag.resolved_at = utcnow()
    flag.resolved_by = resolved_by.id
    create_notification(
        db,
        flag.student_id,
        f"Flag resolved: {flag.rule.value}",
        flag.resolution_note,
        notifications.FLAG_RESOLVED,
    )
    db.flush()
    return flag


# --- scheduled jobs ---------------------------------------------------------


def escalate_stale_flags(db: Session, now: datetime) -> list[Flag]:
    """Escalate flags left open past ESCALATION_DAYS and notify every admin.

    Only 'open' flags escalate; a flag already in discussion never does.
    """
    cutoff = now - timedelta(days=flag_config.ESCALATION_DAYS)
    stale = db.scalars(
        select(Flag).where(Flag.status == FlagStatus.open, Flag.raised_at < cutoff)
    ).all()
    if not stale:
        return []

    admin_ids = db.scalars(
        select(User.id).where(
            User.role == UserRole.admin, User.status == UserStatus.active
        )
    ).all()
    for flag in stale:
        flag.status = FlagStatus.escalated
        flag.escalated_at = now
        for admin_id in admin_ids:
            create_notification(
                db,
                admin_id,
                f"Flag escalated: {flag.rule.value}",
                f"{flag.student.name} ({flag.student.roll_no}): unresolved for "
                f"over {flag_config.ESCALATION_DAYS} days. {flag.reason}",
                notifications.FLAG_ESCALATED,
            )
    db.flush()
    return stale


def run_deadline_scan(db: Session, now: datetime) -> list[Flag]:
    """Raise F5 for every active student who missed a past deadline.

    Semesters are scanned whether open or closed: a closed semester with a
    missed deadline still counts as missed. Dedup is left to raise_flags.
    """
    created = []
    for semester in db.scalars(select(Semester).order_by(Semester.id)).all():
        checks = (
            (semester.internal_deadline, InternalSubmission, "Internal marks"),
            (semester.result_deadline, SemesterResult, "Semester result"),
        )
        for deadline, model, what in checks:
            if deadline is None or deadline >= now:
                continue
            has_live_submission = exists().where(
                model.student_id == User.id,
                model.semester_id == semester.id,
                model.status.in_(LIVE_SUBMISSION_STATUSES),
            )
            students = db.scalars(
                select(User)
                .where(
                    User.role == UserRole.student,
                    User.status == UserStatus.active,
                    ~has_live_submission,
                )
                .order_by(User.id)
            ).all()
            reason = f"{what} deadline missed for {semester.label}"
            for student in students:
                created.extend(
                    raise_flags(db, student, semester, [(FlagRule.F5, reason)])
                )
    return created
