from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite:///./dev.db"
    # Dev-only default; always override via .env outside local development.
    SECRET_KEY: str = "dev-insecure-secret-key-change-me-in-dotenv"
    TOKEN_EXPIRE_MINUTES: int = 120
    # Uploaded proof files live under <UPLOAD_DIR>/proofs/. Never served statically.
    UPLOAD_DIR: str = "uploads"

    # Outgoing email. With SMTP_HOST unset, emails are logged and skipped.
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "Mentora <no-reply@mentora.local>"
    SMTP_STARTTLS: bool = True

    # In-process APScheduler (deadline scan, escalation, reminders).
    SCHEDULER_ENABLED: bool = True
    # Shared secret for POST /admin/jobs/run (external cron fallback).
    # Unset disables the endpoint.
    JOB_SECRET: str | None = None

    # Only read by scripts/seed_admin.py.
    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None


settings = Settings()
