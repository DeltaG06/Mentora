"""Service-level tests for the flag engine (the >=70% coverage NFR lives here)."""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core import flag_config
from app.models import Flag, Notification
from app.models.enums import (
    FlagRule,
    FlagStatus,
    SemesterStatus,
    SubmissionStatus,
    UserRole,
    UserStatus,
)
from app.services import flag_engine, notifications
from app.services.flag_engine import (
    EmptyResolutionNote,
    FlagAlreadyResolved,
    compute_effective,
    evaluate_internal,
    evaluate_result,
    raise_flags,
)
from tests.helpers import allocate, make_internal, make_result, make_semester, make_user

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
PAST = NOW - timedelta(days=3)
FUTURE = NOW + timedelta(days=3)


@pytest.fixture()
def student(db):
    return make_user(db, "rohan", UserRole.student)


@pytest.fixture()
def mentor(db):
    return make_user(db, "desai", UserRole.mentor)


@pytest.fixture()
def sem1(db):
    return make_semester(db, "Sem 1", date(2026, 1, 10))


@pytest.fixture()
def sem2(db):
    return make_semester(db, "Sem 2", date(2026, 7, 15))


def flags_of(db, student, **filters):
    db.expire_all()
    query = select(Flag).where(Flag.student_id == student.id).order_by(Flag.id)
    return db.scalars(query.filter_by(**filters)).all()


def notes_of(db, user, type_):
    return db.scalars(
        select(Notification).where(
            Notification.user_id == user.id, Notification.type == type_
        )
    ).all()


# --- thresholds -------------------------------------------------------------


def test_locked_threshold_defaults():
    assert flag_config.F1_SGPA_DROP == 1.0
    assert flag_config.F2_SUBJECT_FAIL == 40
    assert flag_config.F3_SGPA_ABSOLUTE == 6.0
    assert flag_config.F4_INTERNAL_PCT == 40.0
    assert flag_config.F4_INTERNAL_DROP_PTS == 15.0
    assert flag_config.ESCALATION_DAYS == 14


# --- compute_effective ------------------------------------------------------


@pytest.mark.parametrize(
    "marks, expected",
    [
        ((12, 18, 8), 15),  # best two of three
        ((14, None, None), 14),  # single mark
        ((None, None, 9), 9),
        ((10, None, 16), 13),  # two marks
        ((10, 10, 10), 10),  # ties
        ((5, 9, 9), 9),
        ((9, 5, 9), 9),
        ((0, 0, 0), 0),
        ((17, 18, None), 17.5),
    ],
)
def test_compute_effective(marks, expected):
    assert compute_effective(*marks) == expected


def test_compute_effective_requires_a_mark():
    with pytest.raises(ValueError):
        compute_effective(None, None, None)


# --- F4: internals ----------------------------------------------------------


def test_f4a_triggers_below_40_percent(db, student, sem1):
    submission = make_internal(
        db, student, sem1, {"DSA": (6, 6, None), "Maths": (18, 16, 12)}
    )
    assert evaluate_internal(submission) == [
        (FlagRule.F4, "Subject 'DSA' internal 30.0% (below 40%)")
    ]


def test_f4a_not_triggered_on_healthy_marks(db, student, sem1):
    submission = make_internal(
        db, student, sem1, {"DSA": (16, 14, 12), "Maths": (18, 16, None)}
    )
    assert evaluate_internal(submission) == []


def test_f4a_boundary_exactly_40_percent_is_not_flagged(db, student, sem1):
    submission = make_internal(db, student, sem1, {"DSA": (8, 8, 2)})  # 8/20 = 40%
    assert evaluate_internal(submission) == []


def test_f4a_is_scale_independent(db, student, sem1):
    # 12/40 is 30%, although 12 would be a healthy mark out of 20.
    submission = make_internal(db, student, sem1, {"DSA": (12, 12, 12)}, max_per_test=40)
    assert evaluate_internal(submission)[0][1].startswith("Subject 'DSA' internal 30.0%")


def test_f4a_lists_every_failing_subject_in_one_flag(db, student, sem1):
    submission = make_internal(db, student, sem1, {"DSA": (6, 6, 6), "OS": (4, 4, 4)})
    triggered = evaluate_internal(submission)
    assert len(triggered) == 1
    assert triggered[0][1] == (
        "Subject 'DSA' internal 30.0% (below 40%); "
        "Subject 'OS' internal 20.0% (below 40%)"
    )


def test_f4b_triggers_on_drop_vs_baseline(db, student, sem1, sem2):
    make_internal(db, student, sem1, {"DSA": (78, 78, None)}, max_per_test=100)
    current = make_internal(db, student, sem2, {"DSA": (60, 60, None)}, max_per_test=100)
    assert evaluate_internal(current) == [
        (FlagRule.F4, "Internal average fell from 78.0% to 60.0%")
    ]


def test_f4b_triggers_at_exactly_15_points(db, student, sem1, sem2):
    make_internal(db, student, sem1, {"DSA": (78, 78, None)}, max_per_test=100)
    current = make_internal(db, student, sem2, {"DSA": (63, 63, None)}, max_per_test=100)
    assert evaluate_internal(current) == [
        (FlagRule.F4, "Internal average fell from 78.0% to 63.0%")
    ]


def test_f4b_skipped_when_drop_is_14_9(db, student, sem1, sem2):
    make_internal(db, student, sem1, {"DSA": (780, 780, None)}, max_per_test=1000)
    current = make_internal(db, student, sem2, {"DSA": (631, 631, None)}, max_per_test=1000)
    assert evaluate_internal(current) == []


def test_f4b_skipped_without_baseline(db, student, sem2):
    current = make_internal(db, student, sem2, {"DSA": (60, 60, None)}, max_per_test=100)
    assert evaluate_internal(current) == []


def test_f4b_ignores_unverified_baseline(db, student, sem1, sem2):
    make_internal(
        db, student, sem1, {"DSA": (90, 90, None)}, max_per_test=100,
        status=SubmissionStatus.pending,
    )
    current = make_internal(db, student, sem2, {"DSA": (60, 60, None)}, max_per_test=100)
    assert evaluate_internal(current) == []


def test_f4b_ignores_other_students_and_later_semesters(db, student, sem1, sem2):
    other = make_user(db, "priya", UserRole.student)
    make_internal(db, other, sem1, {"DSA": (95, 95, None)}, max_per_test=100)
    # The student's only other submission is in a LATER semester: not a baseline.
    make_internal(db, student, sem2, {"DSA": (95, 95, None)}, max_per_test=100)
    current = make_internal(db, student, sem1, {"DSA": (60, 60, None)}, max_per_test=100)
    assert evaluate_internal(current) == []


def test_f4b_uses_average_across_subjects(db, student, sem1, sem2):
    make_internal(db, student, sem1, {"A": (90, 90, None), "B": (70, 70, None)}, max_per_test=100)
    current = make_internal(
        db, student, sem2, {"A": (70, 70, None), "B": (50, 50, None)}, max_per_test=100
    )
    assert evaluate_internal(current) == [
        (FlagRule.F4, "Internal average fell from 80.0% to 60.0%")
    ]


def test_f4_a_and_b_combine_into_one_reason(db, student, sem1, sem2):
    make_internal(db, student, sem1, {"DSA": (80, 80, None)}, max_per_test=100)
    current = make_internal(db, student, sem2, {"DSA": (30, 30, None)}, max_per_test=100)
    assert evaluate_internal(current) == [
        (
            FlagRule.F4,
            "Subject 'DSA' internal 30.0% (below 40%); "
            "Internal average fell from 80.0% to 30.0%",
        )
    ]


def test_baseline_falls_back_to_id_order_without_start_date(db, student):
    first = make_semester(db, "No date 1")
    second = make_semester(db, "No date 2")
    make_internal(db, student, first, {"DSA": (80, 80, None)}, max_per_test=100)
    current = make_internal(db, student, second, {"DSA": (60, 60, None)}, max_per_test=100)
    assert evaluate_internal(current) == [
        (FlagRule.F4, "Internal average fell from 80.0% to 60.0%")
    ]
    # And the earlier one has no baseline of its own.
    assert evaluate_internal(db.get(type(current), 1)) == []


def test_baseline_is_the_most_recent_earlier_semester(db, student, sem1, sem2):
    sem3 = make_semester(db, "Sem 3", date(2027, 1, 10))
    make_internal(db, student, sem1, {"DSA": (95, 95, None)}, max_per_test=100)
    make_internal(db, student, sem2, {"DSA": (70, 70, None)}, max_per_test=100)
    current = make_internal(db, student, sem3, {"DSA": (60, 60, None)}, max_per_test=100)
    # 10 points below Sem 2 (the baseline), though 35 below Sem 1.
    assert evaluate_internal(current) == []


# --- F1, F2, F3: results ----------------------------------------------------


def test_f1_demo_story(db, student, sem1, sem2):
    make_result(db, student, sem1, 8.2)
    current = make_result(db, student, sem2, 6.4)
    assert evaluate_result(current) == [(FlagRule.F1, "SGPA fell from 8.2 to 6.4")]


def test_f1_triggers_at_exactly_1_0_drop(db, student, sem1, sem2):
    make_result(db, student, sem1, 8.2)
    current = make_result(db, student, sem2, 7.2)
    assert evaluate_result(current) == [(FlagRule.F1, "SGPA fell from 8.2 to 7.2")]


def test_f1_not_triggered_at_0_9_drop(db, student, sem1, sem2):
    make_result(db, student, sem1, 8.2)
    current = make_result(db, student, sem2, 7.3)
    assert evaluate_result(current) == []


def test_f1_skipped_without_baseline(db, student, sem2):
    current = make_result(db, student, sem2, 6.4)
    assert evaluate_result(current) == []


def test_f1_ignores_unverified_baseline(db, student, sem1, sem2):
    make_result(db, student, sem1, 9.5, status=SubmissionStatus.pending)
    current = make_result(db, student, sem2, 6.4)
    assert evaluate_result(current) == []


def test_f1_uses_most_recent_earlier_result(db, student, sem1, sem2):
    sem3 = make_semester(db, "Sem 3", date(2027, 1, 10))
    make_result(db, student, sem1, 9.0)
    make_result(db, student, sem2, 7.0)
    current = make_result(db, student, sem3, 6.5)  # 0.5 below Sem 2
    assert evaluate_result(current) == []


@pytest.mark.parametrize("marks, flagged", [(39, True), (40, False), (0, True)])
def test_f2_boundary(db, student, sem1, marks, flagged):
    result = make_result(db, student, sem1, 7.0, {"DSA": marks, "Maths": 75})
    expected = (
        [(FlagRule.F2, f"Subject 'DSA' marks {marks} (below 40)")] if flagged else []
    )
    assert evaluate_result(result) == expected


def test_f2_reason_format_and_multiple_subjects(db, student, sem1):
    result = make_result(db, student, sem1, 7.0, {"DSA": 32, "OS": 12, "Maths": 80})
    assert evaluate_result(result) == [
        (FlagRule.F2, "Subject 'DSA' marks 32 (below 40); Subject 'OS' marks 12 (below 40)")
    ]


@pytest.mark.parametrize(
    "sgpa, reason",
    [
        (6.0, None),  # exactly 6.0 is not below 6.0
        (5.99, "SGPA 5.99 (below 6.0)"),
        (5.8, "SGPA 5.8 (below 6.0)"),
    ],
)
def test_f3_boundary(db, student, sem1, sgpa, reason):
    result = make_result(db, student, sem1, sgpa)
    expected = [(FlagRule.F3, reason)] if reason else []
    assert evaluate_result(result) == expected


def test_f1_f2_f3_can_all_fire_together(db, student, sem1, sem2):
    make_result(db, student, sem1, 8.0)
    current = make_result(db, student, sem2, 5.5, {"DSA": 20})
    assert [rule for rule, _ in evaluate_result(current)] == [
        FlagRule.F1,
        FlagRule.F2,
        FlagRule.F3,
    ]


# --- raise_flags: dedup and notifications -----------------------------------


def test_raise_flags_creates_open_flag_and_notifies(db, student, mentor, sem1):
    allocate(db, student, mentor)
    created = raise_flags(db, student, sem1, [(FlagRule.F3, "SGPA 5.8 (below 6.0)")])
    db.commit()

    assert len(created) == 1
    flag = flags_of(db, student)[0]
    assert flag.status == FlagStatus.open
    assert flag.rule == FlagRule.F3
    assert flag.reason == "SGPA 5.8 (below 6.0)"
    assert flag.raised_at is not None

    assert len(notes_of(db, student, notifications.FLAG_RAISED)) == 1
    mentor_notes = notes_of(db, mentor, notifications.FLAG_RAISED)
    assert len(mentor_notes) == 1
    assert "ROHAN" in mentor_notes[0].message


def test_raise_flags_without_mentor_notifies_student_only(db, student, sem1):
    raise_flags(db, student, sem1, [(FlagRule.F3, "x")])
    db.commit()
    assert len(db.scalars(select(Notification)).all()) == 1


def test_dedup_same_rule_twice_gives_one_flag(db, student, sem1):
    assert len(raise_flags(db, student, sem1, [(FlagRule.F2, "first")])) == 1
    assert raise_flags(db, student, sem1, [(FlagRule.F2, "second")]) == []
    db.commit()

    flags = flags_of(db, student)
    assert len(flags) == 1 and flags[0].reason == "first"
    assert len(notes_of(db, student, notifications.FLAG_RAISED)) == 1


@pytest.mark.parametrize("status", [FlagStatus.in_discussion, FlagStatus.escalated])
def test_dedup_covers_every_unresolved_status(db, student, sem1, status):
    flag = raise_flags(db, student, sem1, [(FlagRule.F2, "first")])[0]
    flag.status = status
    db.commit()
    assert raise_flags(db, student, sem1, [(FlagRule.F2, "second")]) == []


def test_different_rules_same_semester_give_two_flags(db, student, sem1):
    created = raise_flags(db, student, sem1, [(FlagRule.F2, "a"), (FlagRule.F3, "b")])
    db.commit()
    assert {flag.rule for flag in created} == {FlagRule.F2, FlagRule.F3}
    assert len(flags_of(db, student)) == 2


def test_same_rule_in_different_semesters_gives_two_flags(db, student, sem1, sem2):
    raise_flags(db, student, sem1, [(FlagRule.F3, "a")])
    raise_flags(db, student, sem2, [(FlagRule.F3, "b")])
    db.commit()
    assert len(flags_of(db, student)) == 2


def test_resolved_flag_does_not_block_a_new_one(db, student, mentor, sem1):
    first = raise_flags(db, student, sem1, [(FlagRule.F3, "first")])[0]
    flag_engine.resolve_flag(db, first, "Counselled", mentor)
    second = raise_flags(db, student, sem1, [(FlagRule.F3, "second")])
    db.commit()

    assert len(second) == 1
    statuses = [flag.status for flag in flags_of(db, student)]
    assert statuses == [FlagStatus.resolved, FlagStatus.open]


# --- resolve_flag -----------------------------------------------------------


@pytest.mark.parametrize("note", ["", "   ", None])
def test_resolve_requires_a_note(db, student, mentor, sem1, note):
    flag = raise_flags(db, student, sem1, [(FlagRule.F3, "x")])[0]
    with pytest.raises(EmptyResolutionNote):
        flag_engine.resolve_flag(db, flag, note, mentor)
    assert flag.status == FlagStatus.open


def test_resolve_sets_fields_and_notifies_student(db, student, mentor, sem1):
    flag = raise_flags(db, student, sem1, [(FlagRule.F3, "x")])[0]
    flag_engine.resolve_flag(db, flag, "  Met and agreed a study plan  ", mentor)
    db.commit()

    flag = flags_of(db, student)[0]
    assert flag.status == FlagStatus.resolved
    assert flag.resolution_note == "Met and agreed a study plan"
    assert flag.resolved_by == mentor.id
    assert flag.resolved_at is not None
    assert len(notes_of(db, student, notifications.FLAG_RESOLVED)) == 1


def test_double_resolve_raises(db, student, mentor, sem1):
    flag = raise_flags(db, student, sem1, [(FlagRule.F3, "x")])[0]
    flag_engine.resolve_flag(db, flag, "done", mentor)
    with pytest.raises(FlagAlreadyResolved):
        flag_engine.resolve_flag(db, flag, "again", mentor)


def test_both_resolve_errors_are_value_errors():
    assert issubclass(EmptyResolutionNote, ValueError)
    assert issubclass(FlagAlreadyResolved, ValueError)


@pytest.mark.parametrize("status", [FlagStatus.in_discussion, FlagStatus.escalated])
def test_resolve_works_from_any_unresolved_status(db, student, mentor, sem1, status):
    flag = raise_flags(db, student, sem1, [(FlagRule.F3, "x")])[0]
    flag.status = status
    flag_engine.resolve_flag(db, flag, "done", mentor)
    assert flag.status == FlagStatus.resolved


# --- on_*_verified ----------------------------------------------------------


def test_on_internal_verified_raises_f4(db, student, mentor, sem1):
    submission = make_internal(db, student, sem1, {"DSA": (6, 6, None)}, verified_by=mentor.id)
    created = flag_engine.on_internal_verified(db, submission)
    db.commit()

    assert [flag.rule for flag in created] == [FlagRule.F4]
    assert flags_of(db, student)[0].reason == "Subject 'DSA' internal 30.0% (below 40%)"


def test_on_internal_verified_healthy_marks_raise_nothing(db, student, mentor, sem1):
    submission = make_internal(db, student, sem1, {"DSA": (16, 16, None)}, verified_by=mentor.id)
    assert flag_engine.on_internal_verified(db, submission) == []
    assert flags_of(db, student) == []


def test_on_result_verified_raises_f1_f2_f3(db, student, mentor, sem1, sem2):
    make_result(db, student, sem1, 8.2)
    result = make_result(db, student, sem2, 5.9, {"DSA": 32}, verified_by=mentor.id)
    created = flag_engine.on_result_verified(db, result)
    db.commit()

    assert {flag.rule for flag in created} == {FlagRule.F1, FlagRule.F2, FlagRule.F3}
    assert all(flag.semester_id == sem2.id for flag in flags_of(db, student))


def test_on_result_verified_is_idempotent(db, student, mentor, sem1):
    result = make_result(db, student, sem1, 5.0, verified_by=mentor.id)
    assert len(flag_engine.on_result_verified(db, result)) == 1
    assert flag_engine.on_result_verified(db, result) == []


def test_retrigger_after_resolution_creates_new_open_flag(db, student, mentor, sem1):
    result = make_result(db, student, sem1, 5.0, verified_by=mentor.id)
    first = flag_engine.on_result_verified(db, result)[0]
    flag_engine.resolve_flag(db, first, "Discussed", mentor)

    second = flag_engine.on_result_verified(db, result)
    db.commit()
    assert len(second) == 1 and second[0].id != first.id
    assert [f.status for f in flags_of(db, student)] == [
        FlagStatus.resolved,
        FlagStatus.open,
    ]


# --- F5 auto-resolve --------------------------------------------------------


def test_late_internal_verification_auto_resolves_f5(db, student, mentor, sem1):
    f5 = raise_flags(db, student, sem1, [(FlagRule.F5, "Internal marks deadline missed")])[0]
    submission = make_internal(db, student, sem1, {"DSA": (16, 16, None)}, verified_by=mentor.id)

    flag_engine.on_internal_verified(db, submission)
    db.commit()

    db.refresh(f5)
    assert f5.status == FlagStatus.resolved
    assert f5.resolution_note == "Auto-resolved: late submission verified"
    assert f5.resolved_by == mentor.id
    assert f5.resolved_at is not None


def test_late_result_verification_auto_resolves_f5(db, student, mentor, sem1):
    f5 = raise_flags(db, student, sem1, [(FlagRule.F5, "Semester result deadline missed")])[0]
    result = make_result(db, student, sem1, 8.0, verified_by=mentor.id)

    flag_engine.on_result_verified(db, result)
    db.commit()

    db.refresh(f5)
    assert f5.status == FlagStatus.resolved
    assert f5.resolution_note == "Auto-resolved: late submission verified"
    assert f5.resolved_by == mentor.id


def test_auto_resolve_only_touches_open_f5_of_that_semester(db, student, mentor, sem1, sem2):
    other_semester_f5 = raise_flags(db, student, sem2, [(FlagRule.F5, "x")])[0]
    escalated_f5 = raise_flags(db, student, sem1, [(FlagRule.F5, "x")])[0]
    escalated_f5.status = FlagStatus.escalated
    f3 = raise_flags(db, student, sem1, [(FlagRule.F3, "x")])[0]
    db.flush()

    assert flag_engine.auto_resolve_open_f5(db, student, sem1, mentor.id) is None
    assert other_semester_f5.status == FlagStatus.open
    assert escalated_f5.status == FlagStatus.escalated
    assert f3.status == FlagStatus.open


# --- escalation -------------------------------------------------------------


def aged_flag(db, student, semester, days, status=FlagStatus.open, rule=FlagRule.F3):
    flag = raise_flags(db, student, semester, [(rule, "x")])[0]
    flag.raised_at = NOW - timedelta(days=days)
    flag.status = status
    db.commit()
    return flag


def test_15_day_old_open_flag_escalates_and_notifies_all_active_admins(db, student, sem1):
    admins = [make_user(db, f"admin{i}", UserRole.admin) for i in range(2)]
    inactive_admin = make_user(db, "old", UserRole.admin, status=UserStatus.deactivated)
    flag = aged_flag(db, student, sem1, days=15)

    escalated = flag_engine.escalate_stale_flags(db, NOW)
    db.commit()

    assert [f.id for f in escalated] == [flag.id]
    db.refresh(flag)
    assert flag.status == FlagStatus.escalated
    assert flag.escalated_at == NOW
    for admin in admins:
        assert len(notes_of(db, admin, notifications.FLAG_ESCALATED)) == 1
    assert notes_of(db, inactive_admin, notifications.FLAG_ESCALATED) == []


def test_13_day_old_flag_does_not_escalate(db, student, sem1):
    flag = aged_flag(db, student, sem1, days=13)
    assert flag_engine.escalate_stale_flags(db, NOW) == []
    db.refresh(flag)
    assert flag.status == FlagStatus.open


def test_exactly_14_days_does_not_escalate(db, student, sem1):
    aged_flag(db, student, sem1, days=14)
    assert flag_engine.escalate_stale_flags(db, NOW) == []


def test_in_discussion_never_escalates(db, student, sem1):
    flag = aged_flag(db, student, sem1, days=60, status=FlagStatus.in_discussion)
    assert flag_engine.escalate_stale_flags(db, NOW) == []
    db.refresh(flag)
    assert flag.status == FlagStatus.in_discussion


def test_resolved_and_already_escalated_flags_are_left_alone(db, student, sem1, sem2):
    aged_flag(db, student, sem1, days=60, status=FlagStatus.resolved)
    aged_flag(db, student, sem2, days=60, status=FlagStatus.escalated)
    assert flag_engine.escalate_stale_flags(db, NOW) == []


def test_escalation_is_idempotent(db, student, sem1):
    make_user(db, "admin", UserRole.admin)
    aged_flag(db, student, sem1, days=20)
    assert len(flag_engine.escalate_stale_flags(db, NOW)) == 1
    assert flag_engine.escalate_stale_flags(db, NOW) == []


# --- F5 deadline scan -------------------------------------------------------


def test_missed_internal_deadline_raises_f5(db, student):
    semester = make_semester(db, "Sem 1", internal_deadline=PAST)
    created = flag_engine.run_deadline_scan(db, NOW)
    db.commit()

    assert len(created) == 1
    flag = flags_of(db, student)[0]
    assert flag.rule == FlagRule.F5
    assert flag.semester_id == semester.id
    assert flag.reason == "Internal marks deadline missed for Sem 1"


def test_missed_result_deadline_raises_f5(db, student):
    make_semester(db, "Sem 1", result_deadline=PAST)
    flag_engine.run_deadline_scan(db, NOW)
    db.commit()
    assert flags_of(db, student)[0].reason == "Semester result deadline missed for Sem 1"


def test_future_or_unset_deadlines_raise_nothing(db, student):
    make_semester(db, "Future", internal_deadline=FUTURE, result_deadline=FUTURE)
    make_semester(db, "Unset")
    assert flag_engine.run_deadline_scan(db, NOW) == []


def test_already_flagged_student_is_not_flagged_again(db, student):
    make_semester(db, "Sem 1", internal_deadline=PAST)
    assert len(flag_engine.run_deadline_scan(db, NOW)) == 1
    assert flag_engine.run_deadline_scan(db, NOW + timedelta(days=1)) == []
    db.commit()
    assert len(flags_of(db, student)) == 1


def test_both_deadlines_missed_gives_one_f5_per_semester(db, student):
    make_semester(db, "Sem 1", internal_deadline=PAST, result_deadline=PAST)
    assert len(flag_engine.run_deadline_scan(db, NOW)) == 1


@pytest.mark.parametrize("status", [SubmissionStatus.pending, SubmissionStatus.verified])
def test_student_with_live_internal_submission_is_not_flagged(db, student, status):
    semester = make_semester(db, "Sem 1", internal_deadline=PAST)
    make_internal(db, student, semester, {"DSA": (15, 15, None)}, status=status)
    assert flag_engine.run_deadline_scan(db, NOW) == []


def test_student_with_live_result_is_not_flagged(db, student):
    semester = make_semester(db, "Sem 1", result_deadline=PAST)
    make_result(db, student, semester, 8.0, status=SubmissionStatus.pending)
    assert flag_engine.run_deadline_scan(db, NOW) == []


def test_rejected_submission_still_counts_as_missed(db, student):
    semester = make_semester(db, "Sem 1", internal_deadline=PAST)
    make_internal(
        db, student, semester, {"DSA": (15, 15, None)}, status=SubmissionStatus.rejected
    )
    assert len(flag_engine.run_deadline_scan(db, NOW)) == 1


def test_closed_semester_with_missed_deadline_still_raises(db, student):
    make_semester(db, "Closed", internal_deadline=PAST, status=SemesterStatus.closed)
    assert len(flag_engine.run_deadline_scan(db, NOW)) == 1


def test_scan_only_flags_active_students(db, student, mentor):
    make_user(db, "gone", UserRole.student, status=UserStatus.deactivated)
    make_user(db, "admin", UserRole.admin)
    make_semester(db, "Sem 1", internal_deadline=PAST)

    created = flag_engine.run_deadline_scan(db, NOW)
    assert [flag.student_id for flag in created] == [student.id]


def test_scan_notifies_student_and_mentor(db, student, mentor):
    allocate(db, student, mentor)
    make_semester(db, "Sem 1", internal_deadline=PAST)
    flag_engine.run_deadline_scan(db, NOW)
    db.commit()
    assert len(notes_of(db, student, notifications.FLAG_RAISED)) == 1
    assert len(notes_of(db, mentor, notifications.FLAG_RAISED)) == 1
