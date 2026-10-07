-- Defense-in-depth layer 2: database-enforced business rules

CREATE UNIQUE INDEX uq_one_active_allocation
ON allocations (student_id)
WHERE status = 'active';

CREATE UNIQUE INDEX uq_one_live_internal_submission
ON internal_submissions (student_id, semester_id)
WHERE status IN ('pending', 'verified');

CREATE UNIQUE INDEX uq_one_live_semester_result
ON semester_results (student_id, semester_id)
WHERE status IN ('pending', 'verified');

CREATE UNIQUE INDEX uq_one_unresolved_flag
ON flags (student_id, semester_id, rule)
WHERE status IN ('open', 'in_discussion', 'escalated');

CREATE UNIQUE INDEX uq_one_live_meeting_per_slot
ON meetings (slot_id)
WHERE status IN ('scheduled', 'completed');

| Table | Rule | Enforced as |
|---|---|---|
| `allocations` | One **active** mentor per student | Partial unique on `(student_id)` WHERE status = active |
| `internal_submissions` | One **live** submission per (student, semester) | Partial unique WHERE status IN (pending, verified) — *rejected rows are history, unlimited* |
| `semester_results` | Same | Same |
| `flags` | One **unresolved** flag per (rule, student, semester) | Partial unique WHERE status IN (open, in_discussion, escalated) |



