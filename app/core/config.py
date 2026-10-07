from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite:///./dev.db"
    # Dev-only default; always override via .env outside local development.
    SECRET_KEY: str = "dev-insecure-secret-key-change-me-in-dotenv"
    TOKEN_EXPIRE_MINUTES: int = 120
    # Uploaded proof files live under <UPLOAD_DIR>/proofs/. Never served statically.
    UPLOAD_DIR: str = "uploads"

    # Only read by scripts/seed_admin.py.
    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None


settings = Settings()
