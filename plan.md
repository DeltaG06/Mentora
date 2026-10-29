MENTORA — Build Plan (Master Document)
This file is the single source of execution truth for building Mentora.Any AI coding agent (Claude Code, Antigravity, etc.) MUST:

Read CLAUDE.md first (project rules).
Read this file fully.
Check the PROGRESS table below.
Resume from the first incomplete step. Do NOT redo completed steps.
Execute ONE step at a time: build → verify → commit → update PROGRESS table.
Source-of-Truth Documents (frozen — do not modify without asking user)
Doc	Contents
docs/api-contract.md	All endpoints, rules, status codes (11 modules)
docs/schema.dbml	ER model: 15 tables, every column
docs/db-constraints.md	5 partial unique indexes + plain uniques
CLAUDE.md	Stack rules, coding rules, escalation policy
If implementation conflicts with these docs: STOP and ask the user.

Business Rules Quick Reference (full detail in contract)
FLAG RULES: F1 SGPA drop >=1.0 · F2 subject <40 · F3 SGPA <6.0 ·F4 effective internal <40% OR semester avg drop >=15 percentage points ·F5 deadline missed. Triggers: internal verified -> F4 only; resultverified -> F1-F3; daily scan -> F5. First sem: no baseline -> skipcomparative rules (F1, F4-B).
effective_internal = AVERAGE of best two non-null marks (server-computed only).
Flag lifecycle: open -> in_discussion (linked meeting completed) ->resolved (note MANDATORY). open >14 days -> escalated. in_discussionNEVER escalates. Late verification auto-resolves open F5.
Dedup: one UNRESOLVED flag per (rule, student, semester).
Allocation: exactly 1 active mentor per student; same departmentenforced; reassign ends old row, never deletes; warning (not block) at 15.
Submissions: pending -> verified (immutable) / rejected (note mandatory,re-upload allowed, history retained). One LIVE submission per(student, semester, type).
Meetings: student cancel >= 2h before slot; cancelled booking revertsslot to open; flag linkage happens at completion; reminders T-24h, T-1h.
404 (not 403) when a resource exists but isn't yours — never leak existence.
All timestamps UTC, timezone-aware. effective_internal + all businessmath server-side.
PROGRESS (update after every completed step)
Step	Name	Status	Commit
1	Backend scaffold	✅	ef20228
2	Models + migration + constraints	✅	ef20228
3	Auth + RBAC	✅	ef20228
4	User mgmt + admin seed + audit	✅	ef20228
5	Allocations + notification helper	✅	ef20228
6	Semesters	✅	ef20228
7	Flag engine + flag endpoints	✅	ef20228
8	Internal submissions	✅	ef20228
9	Semester results + proof files	✅	ef20228
10	Slots + meetings + group sessions	⬜	
11	Notifications + email + scheduled jobs	⬜	
12	Dashboards	⬜	
13	Frontend scaffold	⬜	
14	Auth flow + layouts	⬜	
15	Student screens	⬜	
16	Mentor screens	⬜	
17	Admin screens	⬜	
18	Responsive polish	⬜	
19	Test hardening	⬜	
20	Demo seed script	⬜	
21	Deployment	⬜	
=====================================================================BACKEND
STEP 1 — Scaffold
Build: venv, requirements.txt (fastapi, uvicorn[standard], sqlalchemy,alembic, pydantic-settings, PyJWT, passlib[bcrypt], bcrypt,python-multipart, pytest, httpx). Structure: app/main.py (FastAPI, CORSfor localhost:5173+3000, GET /api/v1/health), app/core/config.py(pydantic-settings: DATABASE_URL sqlite default, SECRET_KEY,TOKEN_EXPIRE_MINUTES=120), app/db.py (engine/SessionLocal/Base/get_db,check_same_thread only for sqlite), empty app/api/deps.py..env.example + .gitignore (venv, .env, pycache, *.db, uploads/).Verify: install ok, uvicorn boots, /api/v1/health -> {"status":"ok"},/docs loads. Commit "chore: backend scaffold".

STEP 2 — Models + Migration + Constraints
Build: app/models/ package — ALL 15 tables per docs/schema.dbml.SQLAlchemy 2.0 style, Python enums, composite PK on meeting_flags (no id),FKs ON DELETE RESTRICT, timezone-aware datetimes. Alembic wired toBase.metadata + Settings.DATABASE_URL. Initial migration for all tables.CRITICAL: the 5 partial unique indexes from docs/db-constraints.md mustbe dialect-aware (sqlite_where + postgresql_where) so they work on BOTHSQLite and PostgreSQL. Plain uniques: internal_marks(submission_id,subject_name), result_subjects(result_id, subject_name),group_attendance(session_id, student_id).Verify: inspector test asserts 15 tables + partial indexes present;double-active-allocation insert raises IntegrityError.Commit "feat: database models + migration with integrity constraints".

STEP 3 — Auth + RBAC
Build per contract Module 1: app/core/security.py (bcrypt, JWT withsub=str(user.id)); deps (get_current_user via OAuth2PasswordBearertokenUrl=/api/v1/auth/login, require_roles(*roles)). Routes:POST /auth/register (role student|mentor only; student->active,mentor->pending; 409 dup email/roll_no), POST /auth/login (email inOAuth2 'username' field; pending/deactivated -> 403; bad creds -> 401),GET /auth/me. Response schemas never expose password_hash.Verify: pytest — register 201 both roles, pending mentor login 403,dup email 409, /me no token 401, wrong-role dummy route 403.Commit "feat: auth module with RBAC + tests".

STEP 4 — User Mgmt + Admin Seed + Audit
Build: scripts/seed_admin.py (ADMIN_EMAIL/ADMIN_PASSWORD env, idempotent).PATCH /users/me (name, phone), PATCH /users/me/password (old passwordrequired, 400 mismatch). Admin-only: GET /admin/users (filters role/status/department/year/search name+roll, paginated 20 default 100 max),PATCH /admin/users/{id} (year/division only), PATCH /admin/users/{id}/status (transitions: pending->active, active->deactivated,deactivated->active; else 409). EVERY status change writes audit_log row.Verify: seed, admin login, approve mentor then mentor login 200, invalidtransition 409, student on admin endpoint 403, audit row exists.Commit "feat: user management + admin seed + audit logging".

STEP 5 — Allocations + Notification Helper
Build: app/services/notifications.py — create_notification(db, user_id,title, message, type) + canonical type constants: ALLOCATION, FLAG_RAISED,FLAG_ESCALATED, FLAG_RESOLVED, SUBMISSION_VERIFIED, SUBMISSION_REJECTED,MEETING_BOOKED, MEETING_CANCELLED, MEETING_REMINDER, GROUP_INVITE,ACCOUNT_STATUS. (Email later — never inline it.)POST /admin/allocations {mentor_id, student_ids[]} — PER-STUDENT results{results:[{student_id, status, reason}], warnings:[]}; failures:cross-dept / already-active / not-found; >15 active mentees -> warningentry, STILL succeeds; notification + audit per assignment.POST /admin/allocations/{id}/reassign {new_mentor_id} — end old row(ended_at), create new, notify all three parties. GET /admin/allocations(filters+pagination). GET /students/me/mentor (404 if unassigned).Verify: mixed batch (1 fails, 2 succeed), double-assign fails, >15warns, reassertion leaves BOTH rows, student sees mentor.Commit "feat: allocations module + notification helper".

STEP 6 — Semesters
AUTHORIZED SCHEMA ADDITION: add start_date (Date, nullable) to semesters(model + migration + schema.dbml note) — needed for baseline ordering.Build: GET /semesters (any role, newest first); POST /admin/semesters{label, start_date?}; PATCH /admin/semesters/{id} (both deadlines,status open|closed). Past dates allowed. Closing blocks submissions(rule enforced in submissions modules).Verify: CRUD tests + 403 non-admin + 422 bad enum.Commit "feat: semesters module with start_date".

STEP 7 — Flag Engine + Endpoints (CORE — BE METICULOUS)
Build app/services/flag_engine.py as a SERVICE (no HTTP), thin endpointson top. Thresholds in app/core/flag_config.py ONLY:F1_SGPA_DROP=1.0, F2_SUBJECT_FAIL=40, F3_SGPA_ABSOLUTE=6.0,F4_INTERNAL_PCT=40.0, F4_INTERNAL_DROP_PTS=15.0, ESCALATION_DAYS=14.F4 on PERCENTAGE scale: subject effective% = effective_internal/max_per_test*100; semester avg% = mean of subject %s.

Functions (exact contracts):

compute_effective(i1,i2,i3) -> average of best two non-null marks.
evaluate_internal(submission) -> [(rule, reason)] F4 only.Sub-trigger A: any subject effective% < 40.Sub-trigger B: semester avg% drop >= 15 vs most recent EARLIER verifiedinternal submission (order by semester.start_date, fallback id).No baseline -> A only. Reasons human-readable:"Subject 'DSA' internal 30.0% (below 40%)" /"Internal average fell from 78.0% to 60.0%".
evaluate_result(result) -> [(rule, reason)] F1,F2,F3. F1 vs most recentearlier VERIFIED result (no baseline -> skip): "SGPA fell from 8.2 to6.4". F2: "Subject 'DSA' marks 32 (below 40)". F3: "SGPA 5.8 (below6.0)". Note: F3 is sgpa < 6.0 (strictly).
raise_flags(db, student, semester, triggered) — dedup: skip ifUNRESOLVED flag exists for (rule, student, semester); create openflags; notify student + active mentor (FLAG_RAISED).
on_internal_verified(db, submission) -> F4 eval + raise + auto-F5.
on_result_verified(db, result) -> F1-F3 eval + raise + auto-F5.
auto_resolve_open_f5(db, student, semester, resolved_by): open F5 ->resolved, note "Auto-resolved: late submission verified".
resolve_flag(db, flag, note, resolved_by): empty note -> ValueError(->422); already resolved -> ValueError (->409); notify student.
escalate_stale_flags(db, now): status='open' AND raised_at older than14 days -> 'escalated' + notify active admins. in_discussion NEVER.
run_deadline_scan(db, now): per semester, per past deadline: activestudents with no live submission of that type -> F5 flag (reason namesthe missed deadline + semester). Runs regardless of open/closed status.
Endpoints (contract Module 6): GET /students/me/flags · GET /mentor/flags(own mentees only, ?status=&rule=&semester_id=, include student name/roll) · GET /admin/flags (+?escalated=true) · GET /flags/{id} (scoped:own student / own mentee / admin, else 404) · POST /flags/{id}/resolve({resolution_note}; 422 empty, 409 double-resolve, audit entry).

Verify (this module carries the >=70% coverage NFR — exhaustive):compute_effective (12,18,8)->15, single, two, ties; F4-A fires/not;F4-B fires at 15.0 not 14.9, skipped w/o baseline; F1 at exactly 1.0fires, 0.9 doesn't, no-baseline skip; F2 at 39/40 boundary; F3 6.0 NOTflagged, 5.99 flagged; dedup same-rule, different-rule ok, resolveddoesn't block new; F5 missed/pending-protected/closed-semester-still-counts; escalation 15d fires 13d doesn't in_discussion never; resolve422/409/re-trigger; auto-F5 on both types; endpoint scoping.Commit "feat: flag engine service + endpoints + exhaustive tests".

STEP 8 — Internal Submissions
Build per contract Module 4: POST /students/me/internal-submissions{semester_id, subjects:[{subject_name,i1,i2,i3,max_per_test}]} — semestermust be OPEN (400), >=1 subject, >=1 non-null mark each, 0..max (422),409 if live submission exists, effective NEVER from client.PATCH (pending only; verified 409 immutable; rejected 409 re-uploadinstead). GET own (?semester_id=). GET /mentor/internal-submissions(queue, ?status= default pending, includes student name/roll/semester).GET detail (404 unless active allocation to this mentor).POST /verify — 409 unless pending, 404 unless own mentee; compute +persist effective_internal per subject; call on_internal_verified;response = submission + flags_raised[]; audit. POST /reject — {note}mandatory 422, notify student.Verify: submit->edit->verify->F4 end-to-end with flag row + reason;immutability; reject->re-upload allowed; cross-mentor 404; closed 400;(12,18,8)/20 -> effective 15 in DB.Commit "feat: internal submissions + verification wired to engine".

STEP 9 — Semester Results + Proof
Build per contract Module 5: POST /students/me/results — MULTIPART(semester_id, sgpa 0.00-10.00, subjects, proof_file PDF/JPG/PNG <=5MB —422 wrong type, 413 oversize); 409 if live result; save underuploads/proofs/ (gitignored), store PATH; files NEVER served statically.PATCH pending-only (new file replaces old on disk). GET own.GET /mentor/results queue + detail (mentee-scoped). GET/mentor/results/{id}/proof + /admin/results/{id}/proof — stream withContent-Type, assigned mentor or admin only, else 404.POST /verify — on_result_verified (F1-F3 + auto-F5), response includesflags_raised[], audit. POST /reject — note mandatory, notify.Verify: tiny fixture files; 8.2->6.4 asserts F1 + reason; subject 32asserts F2; SGPA 5.9 asserts F3; late upload auto-resolves F5; proof:assigned mentor 200 / other mentor 404 / admin 200; verified 409.Commit "feat: semester results + proof files + engine wiring".

STEP 10 — Slots + Meetings + Group Sessions
Build per contract Modules 7-9:Slots: POST /mentor/slots {date_time, duration_minutes=30} (futureonly); GET /mentor/slots (?status=&from=&to=); PATCH /mentor/slots/{id}/cancel — open->cancelled; BOOKED->cancel slot AND linked meeting,notify student; GET /students/me/mentor/slots (open only, 404 ifunassigned). NO overlap detection (accepted limitation).Meetings: POST /slots/{id}/book {agenda} — student, own mentor's slot,open only; creates meeting, notify both (MEETING_BOOKED). POST/mentor/slots/{id}/invite {student_id, agenda? default "Mentor-initiatedguidance meeting"} — own mentee, open slot, notify. GET/students/me/meetings + /mentor/meetings (?status=&upcoming=).GET /meetings/{id} (party only, else 404). POST /meetings/{id}/cancel —mentor: before completion; student: >= 2h before slot (else 400); slotreverts to OPEN; notify. POST /meetings/{id}/complete {minutes,linked_flag_ids[]} — set held_at; linked OPEN flags -> in_discussion;response returns moved flags (frontend shows resolve prompt); audit.Group sessions: POST /mentor/group-sessions {date_time,duration_minutes=60, topic, audience_type, student_ids?} — serverresolves audience: all -> active mentees; flagged -> mentees withUNRESOLVED flags (server-side resolution, mentor never hand-picks);selected -> validate each own mentee + student_ids required. Createattendance rows (present=false default), notify invitees (GROUP_INVITE).GET /mentor/group-sessions + /students/me/group-sessions (?status=).POST complete {minutes, attendance:[{student_id,present}]} — attendanceupdated; per-attendee flag linkage = should-have, build only if trivial.POST cancel — notify all.Verify: full booking lifecycle; invite on booked slot 409; studentcancel inside 2h 400 + slot reverts; complete moves linked flags toin_discussion + returns them; audience 'flagged' resolves server-sidecorrectly; cross-mentor 404s throughout.Commit "feat: slots, meetings, group sessions".

STEP 11 — Notifications + Email + Scheduled Jobs
Build: GET /notifications (paginated newest-first);GET /notifications/unread-count; PATCH /notifications/{id}/read;POST /notifications/read-all. Email via SMTP (async background task —NEVER blocks the API call; env: SMTP_HOST/PORT/USER/PASSWORD/FROM).Emails for: FLAG_RAISED, FLAG_ESCALATED, MEETING_BOOKED, MEETING_REMINDER(in-app stays the canonical channel; if SMTP unconfigured, log + skipgracefully).Jobs (APScheduler, in-process; timezone Asia/Kolkata, store UTC):

Daily 00:05 — run_deadline_scan + escalate_stale_flags.
Every 15 min — reminders: meetings + group_sessions starting within24h where rem_24_sent=false -> notify both parties (MEETING_REMINDER),set true; same for 1h / rem_1h_sent.Document fallback for sleeping free-tier hosts: cron-job.org pinging asecret admin endpoint /api/v1/admin/jobs/run (X-Job-Secret header).Verify: notification CRUD + badge count; jobs callable directly intests (no sleep-waiting); reminder sent exactly once; graceful no-SMTP.Commit "feat: notifications, email, scheduled jobs".
STEP 12 — Dashboards
Build per contract Module 11: GET /mentor/dashboard — mentee roster(name, year, latest verified SGPA, flag indicator: red=has unresolvedflag, amber=escalated, green=none), pending verification counts (bothtypes), upcoming meeting count; roster <=15, no pagination.GET /mentor/mentees/{student_id} — full academic history (verifiedresults + internals), flag timeline, meeting history; 404 non-mentee.GET /students/me/dashboard — mentor info, SGPA trend (per semester),own flags summary, upcoming meetings, next open deadline.GET /admin/dashboard (?semester_id=) — coverage % (allocated/totalactive students), meetings-per-mentor, open vs resolved flag counts,avg resolution time (resolved_at - raised_at). GET /admin/analytics(should-have: flags by rule, meetings trend).Verify: seeded scenario — indicator red for flagged student, greenhealthy; coverage math correct; scoping (mentor sees ONLY own mentees).Commit "feat: role dashboards + compliance metrics".

=====================================================================FRONTEND (React + Vite + Tailwind, axios, react-router)
STEP 13 — Scaffold
Vite React app in /frontend. Tailwind. axios instance with baseURL/api/v1 + interceptor: attach Bearer token from localStorage, on 401 ->clear + redirect /login. Router with ProtectedRoute (role prop).Layout shell: sidebar by role, topbar with notification bell (poll/notifications/unread-count every 60s) + badge. Commit "feat: frontendscaffold".

STEP 14 — Auth Flow + Layouts
Pages: Login (email+password -> OAuth2 username field quirk!), Register(role toggle: student form = roll_no/dept/year/division; mentor form =designation). AuthContext (user + token, persisted). Role routing:/student/* /mentor/* /admin/*. Pending-mentor message screen.Commit "feat: auth flow and role layouts".

STEP 15 — Student Screens
Per SRS Appendix 8a: Dashboard (mentor card, SGPA trend line chart,flags list w/ status chips, upcoming meetings, next deadline) · Internalmarks upload (subject grid I1-I3) · Result upload (multipart + prooffile) with verification-status chips (pending/verified/rejected+note) ·My flags (rule, reason, status) · Mentor's open slots (book w/ agenda) ·My meetings (upcoming/past, cancel w/ 2h rule) · Group sessions (upcoming/past) · Notifications center. All API wiring per contract; showflags_raised[] feedback nowhere (student doesn't see engine response —mentors do).Commit "feat: student screens".

STEP 16 — Mentor Screens
Dashboard: roster GRID with red/amber/green flag dots + latest SGPA,pending verification badges, upcoming meetings · Verification queue(both types, tabs) with detail + proof preview (authorized blob fetch)

verify/reject(note) — after verify, DISPLAY flags_raised[] prominently("2 flags raised: F1 — SGPA fell from 8.2 to 6.4") · Mentee drill-down(full history, flag timeline, meetings) · Slots manager (publish, list,cancel) · Invite student (from flagged list) · Group session creation(audience selector: all/flagged/selected) · Meeting completion form(minutes, flag linkage checkboxes, attendance for groups) + resolve-flagprompt (note mandatory) · Flag management (filters, resolve).Commit "feat: mentor screens".
STEP 17 — Admin Screens
Mentor approvals queue (pending users, approve/deactivate) · Allocationmanager (mentor list w/ counts + student multi-select, per-studentresults + capacity warnings, reassign flow) · Semester manager (create,set both deadlines, close) · Escalated flags (force-resolve w/ note) ·Compliance dashboard (coverage %, meetings-per-mentor table, flag stats,avg resolution time; simple charts if cheap) · User management (filters,search, status).Commit "feat: admin screens".

STEP 18 — Responsive Polish
Mobile-first pass on ALL screens (360px target): tables -> cards,sidebar -> bottom nav/hamburger, forms stack, touch targets >= 44px.Test the hero flow on a phone viewport. This is a MUST-have NFR.Commit "feat: responsive polish".

=====================================================================HARDENING, DEMO, DEPLOY
STEP 19 — Test Hardening
Coverage report on app/services/flag_engine.py >= 70% (pytest-cov).Full API smoke: the demo story end-to-end as a pytest journey test.Fix what's red. Commit "test: hardening + coverage".

STEP 20 — Demo Seed Script
scripts/seed_demo.py: admin Shweta, mentor Desai (approved), studentsincl. Rohan (SGPA 8.2 then 6.4 history), semesters w/ deadlines,allocation, submissions, a completed meeting + resolved flag, oneescalated flag. Idempotent, guarded by SEED_DEMO=1 env. This scriptIS the demo — one command to a fully alive system.Commit "feat: demo seed".

STEP 21 — Deployment
Backend -> Render/Railway (Python service, start command uvicorn,env vars: DATABASE_URL=Neon Postgres, SECRET_KEY, ADMIN_EMAIL/PASSWORD,SMTP_*). Run migrations against prod DB. Frontend -> Vercel (VITE_API_URLenv, axios baseURL, backend CORS updated to the Vercel domain).Verify: live health check, register a user, run one hero-flow pass onprod URL. Update README: setup, stack, screenshots, demo credentials.Commit "chore: deployment + README".

How to Kick Off a Claude Code Session With It
First message, verbatim:

text

Read CLAUDE.md and plan.md fully. Check the PROGRESS table, confirm
the first incomplete step with me before writing any code, then execute
that one step end-to-end: build, verify, commit, update the PROGRESS
table. One step only — wait for my go-ahead before the next.
Three Things Baked Into This File (know them)
Batch 3 finally delivered — steps 10–12 were "written and ready" but never issued until now. The reminder-dedup fields, the 2-hour cancel rule, the flagged-audience server-side resolution — all in.
Resume protocol — the PROGRESS table + "first incomplete step" rule means any session, any agent, any day. Your intermittent access is now a non-problem.
Frontend is agent-agnostic — if Claude's gone again by step 13, hand plan.md + api-contract.md to Antigravity and it loses nothing.
One warning: plan.md + the contract docs make the build very autonomous-looking, but you still verify each step yourself — run pytest, click /docs, eyeball the migration. The rules in CLAUDE.md enforce stopping; you enforce looking.