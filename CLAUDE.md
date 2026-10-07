# Mentora

Mentor-mentee management system for Goa College of Engineering (solo SE course
project). Product background, locked decisions and business rules live in
`docs/context.txt` — read it before changing behaviour.

## Stack

- FastAPI, Python 3.10+, SQLAlchemy 2.0 (typed `Mapped[...]` models), Alembic
- SQLite in dev (`dev.db`), PostgreSQL in production — everything must work on both
- JWT (PyJWT) + bcrypt (passlib), roles: `student`, `mentor`, `admin`
- pytest + FastAPI `TestClient`

## Commands

```powershell
venv\Scripts\Activate.ps1
uvicorn app.main:app --reload      # http://localhost:8000/docs
pytest
alembic upgrade head               # apply migrations
alembic revision --autogenerate -m "message"
alembic check                      # models and migrations in sync?
python -m scripts.seed_admin       # needs ADMIN_EMAIL / ADMIN_PASSWORD
```

## Sources of truth

| File | Governs |
|---|---|
| `docs/schema.dbml` | Tables, columns, enums. Models must match it exactly. |
| `docs/db-constraints.md` | The 5 partial unique indexes (DBML cannot express `WHERE`). |
| `docs/api-contract.md` | Endpoints, payloads, status codes. Implement exactly; update the contract first if it must change. |

## Layout

```
app/main.py            app, CORS, /api/v1/health
app/core/              config (Settings), security (hashing, JWT)
app/db.py              make_engine, SessionLocal, Base, get_db
app/models/            one module per domain; enums.py; types.py
app/schemas/           Pydantic request/response models
app/core/flag_config.py  flag thresholds (the only place they are defined)
app/api/deps.py        get_current_user, require_roles
app/api/common.py      shared submission helpers (open semester, mentee scoping)
app/api/routes/        one router per module, mounted in app/api/router.py
app/services/          flag_engine, notifications, audit, allocations, proof_storage
alembic/               migrations
scripts/               operational scripts (seed_admin)
tests/                 pytest; conftest builds a temp DB from the migrations
```

## Rules

- All routes live under `/api/v1`. Errors are `{"detail": "..."}`.
- Response schemas never expose `password_hash`.
- Every FK is `ON DELETE RESTRICT`. Nothing is hard-deleted; deactivate instead.
- Datetimes are timezone-aware UTC. Use `UTCDateTime` columns and
  `app.models.types.utcnow()`; never `datetime.utcnow()` or naive values.
- Enum columns store the member *value* (use `db_enum`). Each enum type is used
  by exactly one table, so PostgreSQL never creates the same type twice.
- Partial unique indexes stay partial (`sqlite_where` + `postgresql_where`).
  A plain unique index breaks the rejected-resubmission flow.
- Schema changes go through an Alembic migration; never `Base.metadata.create_all`.
  Server defaults in migrations must be dialect-neutral (`sa.false()`, not `'0'`).
- Admin status changes and other privileged edits write an `audit_log` row via
  `app.services.audit.log_action`. `audit_log` is append-only.
- Services (`app/services/`) only flush; the route or job that calls them commits.
- Notifications go through `app.services.notifications.create_notification`
  with its type constants. No inline type strings, no email sending in callers.
- Flag rules live in `app/services/flag_engine.py` (no HTTP concerns) and read
  thresholds from `app/core/flag_config.py`. Routes stay a thin layer.
- Proof files live under `uploads/proofs/` and are only reachable through the
  authorised `/proof` endpoints, never a static route.
- On SQLite, do not use `batch_alter_table` on a table that has a partial unique
  index (the rebuild can drop it); use plain `ALTER TABLE` operations instead.
- Tests run against a temp SQLite DB built by `alembic upgrade head`, so they
  exercise the real migration. Add tests with every endpoint.
- Git: feature branches, conventional commit messages (`feat:`, `fix:`, `chore:`).
# Mentora — Project Context

## What this is
Mentora: mentor-mentee management system for a college mentorship scheme.
Students upload academic results; mentors verify them; a flag engine
auto-raises risk flags (rules F1–F5); mentors run slot-based meetings;
admin allocates students and monitors compliance.

## Stack (fixed — do not substitute)
FastAPI + SQLAlchemy 2.0 + Alembic, Python 3.10+.
DB: SQLite (dev) / PostgreSQL (prod) — ALL SQL must be portable across both.
Auth: JWT (PyJWT) + bcrypt. Roles: student / mentor / admin.

## Source of truth — READ BEFORE BUILDING ANYTHING
- docs/api-contract.md — frozen REST contract (endpoints, rules, status codes)
- docs/schema.dbml — ER model, 15 tables, every column
- docs/db-constraints.md — partial unique index specs (business rules)

If your implementation conflicts with these docs: STOP and ask.
Do NOT invent endpoints, rename fields, or add features not in the contract.

## Rules
1. Implement exactly what was asked — nothing more.
2. Every task ends with: tests passing + server boots + git commit.
3. Business rules are enforced in BOTH app layer and DB constraints.
4. Never trust client-computed values (e.g., effective_internal).
5. All timestamps UTC, timezone-aware.
6. No frontend work unless explicitly requested.
7. Changing the contract/schema docs requires asking first.
