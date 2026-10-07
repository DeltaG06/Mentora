# Mentora — REST API Contract

Modules 1–6 are implemented. Meetings, notifications and dashboards are added
as they are designed.

## Global Conventions

- **Base URL:** every endpoint is under `/api/v1`.
- **Format:** JSON request and response bodies, `snake_case` field names.
  The one exception is `POST /auth/login`, which takes an OAuth2 form.
- **Auth:** `Authorization: Bearer <access_token>` (JWT, HS256). The token's
  `sub` claim is the user id as a string; it expires after
  `TOKEN_EXPIRE_MINUTES` (default 120).
- **Roles:** `student`, `mentor`, `admin`.
- **Account status:** `pending`, `active`, `deactivated`. Only `active`
  accounts can log in or use a token.
- **Timestamps:** ISO 8601, UTC, timezone-aware (`2026-10-05T09:30:00Z`).
- **Errors:** `{"detail": "<message>"}`. Validation errors use FastAPI's
  standard 422 body (`detail` is a list).
- **Pagination:** `?page=` (default 1, min 1) and `?page_size=` (default 20,
  max 100). Paginated responses are
  `{"items": [...], "total": <int>, "page": <int>, "page_size": <int>}`.
- **Deletes:** none. Records are deactivated or ended, never removed.

| Status | Meaning |
| --- | --- |
| 200 | OK |
| 201 | Created |
| 204 | Success, no body |
| 400 | Request is well-formed but wrong (e.g. old password mismatch) |
| 401 | Missing, invalid or expired token; bad credentials |
| 403 | Authenticated but not allowed (wrong role, or account not active) |
| 404 | Resource not found |
| 409 | Conflict with current state (duplicate, invalid transition) |
| 422 | Validation error |

### Health

`GET /health` → `200 {"status": "ok"}`. No auth.

---

## Module 1 — Auth & Users

### User object

Returned wherever a user profile appears. `password_hash` is never exposed.

```json
{
  "id": 7,
  "name": "Rohan Naik",
  "email": "rohan@gec.ac.in",
  "role": "student",
  "status": "active",
  "phone": "9876543210",
  "department": "Computer",
  "roll_no": "23CE045",
  "year": 2,
  "division": "A",
  "designation": null,
  "created_at": "2026-10-05T09:30:00Z",
  "updated_at": "2026-10-05T09:30:00Z"
}
```

`roll_no`, `year`, `division` are null for non-students. `designation` is null
for non-mentors.

### Token response

```json
{"access_token": "<jwt>", "token_type": "bearer", "user": { /* User object */ }}
```

### POST /auth/register

Public. Creates a student or mentor. Admins cannot self-register.

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | required, 1–120 chars |
| `email` | string | required, valid email, stored lower-case, unique |
| `password` | string | required, 8–72 chars |
| `role` | string | required, `student` or `mentor` only |
| `phone` | string | optional, max 20 chars |
| `department` | string | required for both roles |
| `roll_no` | string | student: required, unique, stored upper-case |
| `year` | integer | student: required, 1–4 |
| `division` | string | student: required |
| `designation` | string | mentor: required |

Fields that do not belong to the role are ignored and stored as null.

- Student → `status: "active"`.
- Mentor → `status: "pending"` until an admin approves.

Responses:

- `201` Token response. A pending mentor's token is rejected with 403 until
  the account is approved.
- `409` `Email already registered` / `Roll number already registered`
- `422` validation error (including `role: "admin"` or a missing role field)

### POST /auth/login

Public. `application/x-www-form-urlencoded` (OAuth2 password flow): the email
goes in `username`, the password in `password`.

- `200` Token response
- `401` `Incorrect email or password`
- `403` `Account pending admin approval` / `Account deactivated`

Credentials are checked first, so 403 is only returned for a correct password.

### GET /auth/me

Any authenticated role.

- `200` User object
- `401` missing/invalid token
- `403` account not active

### PATCH /users/me

Any authenticated role. Body: `name` (1–120 chars) and/or `phone` (max 20
chars, null clears it). Other fields are rejected with 422.

- `200` updated User object

### PATCH /users/me/password

Any authenticated role. Body: `old_password`, `new_password` (8–72 chars).

- `204` password changed
- `400` `Old password is incorrect`

### GET /admin/users

Admin only. Paginated list, ordered by `id`.

| Query | Meaning |
| --- | --- |
| `role` | `student` / `mentor` / `admin` |
| `status` | `pending` / `active` / `deactivated` |
| `department` | exact match, case-insensitive |
| `year` | 1–4 |
| `search` | case-insensitive substring of `name` or `roll_no` |
| `page`, `page_size` | see Global Conventions |

- `200` `{"items": [User, ...], "total": n, "page": 1, "page_size": 20}`
- `403` caller is not an admin

### PATCH /admin/users/{id}

Admin only. Edits a **student's** `year` (1–4) and/or `division`. No other
field can be changed here. Writes an `audit_log` row (`action: "user.update"`).

- `200` updated User object
- `400` `Only students have year and division`
- `404` `User not found`

### PATCH /admin/users/{id}/status

Admin only. Body: `{"status": "<new status>"}`.

Allowed transitions:

| From | To | Meaning |
| --- | --- | --- |
| `pending` | `active` | approve mentor |
| `active` | `deactivated` | deactivate |
| `deactivated` | `active` | reactivate |

Every successful change writes an `audit_log` row: `actor_id` (the admin),
`action: "user.status_change"`, `entity: "user"`, `entity_id`, `timestamp`, and
`details` `"<old> -> <new>"`.

- `200` updated User object
- `404` `User not found`
- `409` `Invalid status transition: <old> -> <new>` (includes same-status)
- `409` `You cannot change your own status`

### Admin account

There is no API to create an admin. Run `python -m scripts.seed_admin` with
`ADMIN_EMAIL` and `ADMIN_PASSWORD` set (environment or `.env`). It is
idempotent: if a user with that email exists, nothing changes.

---

## Module 2 — Allocations

One active mentor per student, same department, history kept on reassignment.

### POST /admin/allocations

Admin only. Body: `{"mentor_id": 4, "student_ids": [7, 8, 9]}` (1–200 ids).

The mentor must exist, be a mentor and be `active`, otherwise
`404 Mentor not found`.

Each student is processed on its own; the request is never all-or-nothing.

- `200`

```json
{
  "results": [
    {"student_id": 7, "status": "assigned", "reason": null},
    {"student_id": 8, "status": "failed", "reason": "mentor and student departments differ"}
  ],
  "warnings": ["Anjali Desai now has 16 active mentees (recommended maximum is 15)"]
}
```

Failure reasons: `mentor and student departments differ`,
`student already has an active allocation`, `student not found` (also used for
ids that are not active students).

`warnings` is non-empty when the mentor ends up with more than 15 active
mentees. It is a warning only; the assignment still succeeds.

Each successful assignment notifies the mentor and the student (`ALLOCATION`)
and writes one `audit_log` row (`allocation.create`).

### POST /admin/allocations/{id}/reassign

Admin only. Body: `{"new_mentor_id": 5}`.

The old row becomes `status: "ended"` with `ended_at` set; a new `active` row is
created. History is never deleted. The old mentor, new mentor and student are
notified (`ALLOCATION`); one `audit_log` row is written (`allocation.reassign`).

- `200` `{"allocation": Allocation, "warnings": [...]}`
- `400` `Mentor and student departments differ` /
  `Student is already assigned to this mentor`
- `404` `Allocation not found` / `Mentor not found` (missing, not a mentor, or
  not active)
- `409` `Allocation is not active`

### GET /admin/allocations

Admin only. Query: `mentor_id`, `status` (`active` / `ended`), `department`
(case-insensitive), `page`, `page_size`. Paginated, ordered by `id`.

Allocation object:

```json
{
  "id": 3,
  "student": {"id": 7, "name": "Rohan Naik", "roll_no": "23CE045", "department": "Computer", "year": 2, "division": "A"},
  "mentor": {"id": 4, "name": "Anjali Desai", "department": "Computer", "designation": "Associate Professor", "email": "anjali@gec.ac.in"},
  "assigned_by": 1,
  "status": "active",
  "start_date": "2026-10-05T09:30:00Z",
  "ended_at": null
}
```

### GET /students/me/mentor

Student only. Returns the active mentor's `id`, `name`, `department`,
`designation`, `email`.

- `404` `No mentor assigned`

---

## Module 3 — Semesters

Semester object: `id`, `label`, `start_date` (date or null),
`internal_deadline`, `result_deadline` (timestamps or null), `status`
(`open` / `closed`).

### GET /semesters

Any authenticated role. All semesters, newest first (by `id`). Not paginated.

### POST /admin/semesters

Admin only. Body: `{"label": "2026-27 Odd", "start_date": "2026-07-15"}`.
`start_date` is optional. The semester is created `open` with no deadlines.

- `201` Semester object
- `409` `Semester label already exists`

### PATCH /admin/semesters/{id}

Admin only. Body: any of `internal_deadline`, `result_deadline` (timezone-aware
timestamps; past values are allowed so an admin can correct data), `status`
(`open` / `closed`). Other fields are rejected with 422.

Closing a semester blocks new submissions for it (enforced in Modules 4 and 5).

- `200` Semester object
- `404` `Semester not found`

---

## Module 4 — Internal Submissions

Mid-semester internal test marks (I1–I3 per subject). Verification triggers
rule F4. There is no proof file for internal submissions.

Status flow: `pending` → `verified` (immutable, triggers the engine) or
`rejected` (note mandatory; the student uploads a new submission; rejected
rows are kept for audit).

Internal submission object:

```json
{
  "id": 9,
  "student": {"id": 7, "name": "Rohan Naik", "roll_no": "23CE045"},
  "semester": {"id": 2, "label": "2026-27 Odd"},
  "status": "pending",
  "rejection_note": null,
  "verified_by": null,
  "verified_at": null,
  "submitted_at": "2026-10-05T09:30:00Z",
  "subjects": [
    {"subject_name": "DSA", "i1": 12, "i2": 18, "i3": 8, "max_per_test": 20, "effective_internal": null}
  ]
}
```

`effective_internal` is null until verification.

### POST /students/me/internal-submissions

Student only. Body:

```json
{
  "semester_id": 2,
  "subjects": [{"subject_name": "DSA", "i1": 12, "i2": 18, "i3": null, "max_per_test": 20}]
}
```

- At least one subject; subject names unique within the submission.
- Each subject needs at least one non-null mark; every mark is an integer
  within `0..max_per_test`.
- `effective_internal` is never accepted from the client; if sent it is ignored.

Responses:

- `201` Internal submission object (`pending`)
- `400` `semester closed`
- `404` `Semester not found`
- `409` a `pending` or `verified` submission already exists for this
  (student, semester). Rejected submissions do not block.
- `422` validation error

### PATCH /students/me/internal-submissions/{id}

Student only, own submission, `pending` only. Body: `{"subjects": [...]}` with
the same rules; the subject list is replaced.

- `200` Internal submission object
- `404` not the caller's submission
- `409` `verified records are immutable` /
  `rejected records cannot be edited; upload a new one`

### GET /students/me/internal-submissions

Student only. Query: `semester_id`. All statuses, newest first. Not paginated.

### GET /mentor/internal-submissions

Mentor only. Query: `status` (default `pending`). Submissions of the caller's
active mentees, oldest first. Not paginated.

### GET /mentor/internal-submissions/{id}

Mentor only. `404` unless the student has an active allocation to the caller.

### POST /mentor/internal-submissions/{id}/verify

Mentor only, own mentee. Computes `effective_internal` for every subject
server-side and stores it, marks the submission verified (`verified_by`,
`verified_at`), runs the flag engine (F4, plus F5 auto-resolve) and writes an
`audit_log` row (`internal_submission.verify`).

- `200` `{"submission": Internal submission, "flags_raised": [Flag, ...]}`
  (`flags_raised` may be empty)
- `404` not the caller's mentee
- `409` submission is not `pending`

### POST /mentor/internal-submissions/{id}/reject

Mentor only, own mentee. Body: `{"note": "..."}`. The student is notified
(`SUBMISSION_REJECTED`).

- `200` Internal submission object (`rejected`)
- `404` not the caller's mentee
- `409` submission is not `pending`
- `422` note missing, empty or whitespace

---

## Module 5 — Semester Results

End-of-semester result: SGPA, final marks per subject and a proof file.
Verification triggers rules F1, F2 and F3. Status flow is the same as for
internal submissions.

Result object (the stored proof path is never exposed):

```json
{
  "id": 4,
  "student": {"id": 7, "name": "Rohan Naik", "roll_no": "23CE045"},
  "semester": {"id": 2, "label": "2026-27 Odd"},
  "sgpa": 6.4,
  "status": "pending",
  "rejection_note": null,
  "verified_by": null,
  "verified_at": null,
  "submitted_at": "2026-10-05T09:30:00Z",
  "subjects": [{"subject_name": "DSA", "final_marks": 72, "max_marks": 100}]
}
```

### POST /students/me/results

Student only. `multipart/form-data`:

| Field | Rules |
| --- | --- |
| `semester_id` | integer; semester must exist and be open |
| `sgpa` | 0.00–10.00, at most 2 decimal places |
| `subjects` | one form field holding a JSON array string: `[{"subject_name": "DSA", "final_marks": 72, "max_marks": 100}]`. At least one subject, unique names, `final_marks` an integer within `0..max_marks`; `max_marks` defaults to 100 |
| `proof_file` | PDF, JPG or PNG (extension and file signature are both checked), at most 5 MB |

The file is saved under `uploads/proofs/` with a generated name; the database
stores its path relative to the upload directory. Files are never served
statically.

- `201` Result object (`pending`)
- `400` `semester closed`
- `404` `Semester not found`
- `409` a `pending` or `verified` result already exists for this
  (student, semester). Rejected results do not block.
- `413` proof file larger than 5 MB
- `422` validation error, or a proof file that is not PDF/JPG/PNG

### PATCH /students/me/results/{id}

Student only, own result, `pending` only. `multipart/form-data`; every field is
optional: `sgpa`, `subjects` (replaces the list), `proof_file` (replaces the
file; the old file is deleted from disk).

- `200` Result object
- `404` not the caller's result
- `409` `verified records are immutable` /
  `rejected records cannot be edited; upload a new one`

### GET /students/me/results

Student only. Query: `semester_id`. All statuses, newest first. Not paginated.

### GET /mentor/results

Mentor only. Query: `status` (default `pending`). Results of the caller's
active mentees, oldest first. Not paginated.

### GET /mentor/results/{id}

Mentor only. `404` unless the student has an active allocation to the caller.

### GET /mentor/results/{id}/proof and GET /admin/results/{id}/proof

Streams the proof file with its `Content-Type` (`application/pdf`,
`image/jpeg` or `image/png`). The frontend fetches it as a blob with the
Bearer token.

- Mentor route: only the student's assigned (active) mentor.
- Admin route: any admin.
- Anyone else, whatever their role, gets `404`.

### POST /mentor/results/{id}/verify

Mentor only, own mentee. Marks the result verified, runs the flag engine
(F1, F2, F3, plus F5 auto-resolve) and writes an `audit_log` row
(`semester_result.verify`).

- `200` `{"result": Result, "flags_raised": [Flag, ...]}`
- `404` not the caller's mentee
- `409` result is not `pending`

### POST /mentor/results/{id}/reject

Mentor only, own mentee. Body (JSON): `{"note": "..."}`. The student is
notified (`SUBMISSION_REJECTED`).

- `200` Result object (`rejected`)
- `404` not the caller's mentee
- `409` result is not `pending`
- `422` note missing, empty or whitespace

---

## Module 6 — Flags

The engine is a service (`app/services/flag_engine.py`); these endpoints are a
thin layer over it. Flags are raised only by the engine, never by a client.

Flag object:

```json
{
  "id": 12,
  "student": {"id": 7, "name": "Rohan Naik", "roll_no": "23CE045"},
  "semester": {"id": 2, "label": "2026-27 Odd"},
  "rule": "F1",
  "reason": "SGPA fell from 8.2 to 6.4",
  "status": "open",
  "raised_at": "2026-10-05T09:30:00Z",
  "escalated_at": null,
  "resolved_at": null,
  "resolved_by": null,
  "resolution_note": null
}
```

`rule` is `F1`–`F5`. `status` is `open`, `in_discussion`, `escalated` or
`resolved`. All lists are paginated and ordered newest first (`raised_at`).

### GET /students/me/flags

Student only. The caller's own flags.

### GET /mentor/flags

Mentor only. Flags of students with an **active** allocation to the caller.
Query: `status`, `rule`, `semester_id`, `page`, `page_size`.

### GET /admin/flags

Admin only. All flags. Query: as above plus `escalated=true` (only escalated
flags; `false` excludes them).

### GET /flags/{id}

A student sees their own flag, a mentor sees their active mentees' flags, an
admin sees any. Everyone else gets `404 Flag not found` (never 403).

### POST /flags/{id}/resolve

Mentor (own active mentees only) or admin. Body: `{"resolution_note": "..."}`.
Any unresolved flag can be resolved, including an escalated one. The student is
notified (`FLAG_RESOLVED`) and an `audit_log` row is written (`flag.resolve`).

- `200` Flag object
- `403` caller is a student
- `404` flag not visible to the caller
- `409` `Flag is already resolved`
- `422` note missing, empty or whitespace

---

## Business Rules — Flag Engine

Thresholds live only in `app/core/flag_config.py`:

| Constant | Value | Meaning |
| --- | --- | --- |
| `F1_SGPA_DROP` | 1.0 | SGPA drop vs the baseline result |
| `F2_SUBJECT_FAIL` | 40 | raw `final_marks` below this |
| `F3_SGPA_ABSOLUTE` | 6.0 | SGPA below this |
| `F4_INTERNAL_PCT` | 40.0 | effective internal, percent of `max_per_test` |
| `F4_INTERNAL_DROP_PTS` | 15.0 | percentage points, semester average vs baseline |
| `ESCALATION_DAYS` | 14 | days an `open` flag may sit before escalation |

**Effective internal** is the average of the best two non-null marks of
I1–I3, out of `max_per_test`. It is computed server-side at verification and
never accepted from the client. F4 works on percentages: a subject's
effective% is `effective_internal / max_per_test * 100`, and the semester
internal average% is the mean of the subject percentages.

**Baseline** is the student's most recent *earlier verified* record of the
same kind. Earlier means a smaller `semesters.start_date`; when the current
semester has no `start_date`, semester `id` order is used.

| Rule | Triggered by | Condition | Reason text |
| --- | --- | --- | --- |
| F1 | result verified | baseline SGPA − SGPA ≥ 1.0; skipped without a baseline | `SGPA fell from 8.2 to 6.4` |
| F2 | result verified | any subject `final_marks` < 40 | `Subject 'DSA' marks 32 (below 40)` |
| F3 | result verified | SGPA < 6.0 | `SGPA 5.8 (below 6.0)` |
| F4 (A) | internal verified | any subject effective% < 40 | `Subject 'DSA' internal 30.0% (below 40%)` |
| F4 (B) | internal verified | average% dropped ≥ 15 points vs baseline; skipped without a baseline | `Internal average fell from 78.0% to 60.0%` |
| F5 | daily deadline scan | no live submission after a deadline | `Internal marks deadline missed for <label>` / `Semester result deadline missed for <label>` |

- **One flag per rule.** When several conditions of one rule hold (two failed
  subjects, or F4 A and B), the reasons are joined with a semicolon into one flag.
- **Dedup.** A rule is skipped silently while an unresolved flag (`open`,
  `in_discussion`, `escalated`) exists for the same (rule, student, semester).
  A resolved flag does not block a new one. The partial unique index
  `uq_one_unresolved_flag` enforces the same rule in the database.
- **Raising.** New flags are `open`. The student and their active mentor (if
  any) are notified (`FLAG_RAISED`).
- **Resolving.** A note is mandatory. The student is notified.
- **F5 auto-resolve.** Verifying an internal submission or a semester result
  resolves the `open` F5 for that (student, semester) with the note
  `Auto-resolved: late submission verified`, resolved by the verifying mentor.
- **Escalation.** `escalate_stale_flags(db, now)` moves flags that are `open`
  and were raised more than 14 days ago to `escalated` and notifies every
  active admin (`FLAG_ESCALATED`). `in_discussion` flags never escalate.
- **Deadline scan.** `run_deadline_scan(db, now)` checks every semester whose
  `internal_deadline` or `result_deadline` has passed, open or closed. Every
  active student without a live (`pending` or `verified`) submission of that
  kind gets an F5. Rejected submissions do not count as submitted.
