"""Create the admin account from ADMIN_EMAIL / ADMIN_PASSWORD.

Idempotent: if a user with that email already exists, nothing is changed.

    python -m scripts.seed_admin
"""

import sys
from pathlib import Path

# Allow `python scripts/seed_admin.py` as well as `python -m scripts.seed_admin`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models.enums import UserRole, UserStatus  # noqa: E402
from app.models.user import User  # noqa: E402


def seed_admin(db: Session, email: str, password: str) -> bool:
    """Return True if the admin was created, False if the email already exists."""
    email = email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        return False

    db.add(
        User(
            name="Administrator",
            email=email,
            password_hash=hash_password(password),
            role=UserRole.admin,
            status=UserStatus.active,
        )
    )
    db.commit()
    return True


def main() -> int:
    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        print("Set ADMIN_EMAIL and ADMIN_PASSWORD (environment or .env) first.")
        return 1

    with SessionLocal() as db:
        created = seed_admin(db, settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)

    if created:
        print(f"Admin created: {settings.ADMIN_EMAIL}")
    else:
        print(f"User {settings.ADMIN_EMAIL} already exists; nothing changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
