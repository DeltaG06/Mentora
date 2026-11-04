from app.core.config import Settings


def test_postgres_scheme_is_normalised():
    settings = Settings(DATABASE_URL="postgres://u:p@db.example.com/mentora", _env_file=None)
    assert settings.DATABASE_URL == "postgresql://u:p@db.example.com/mentora"


def test_other_urls_are_unchanged():
    url = "postgresql://u:p@db.example.com/mentora?sslmode=require"
    assert Settings(DATABASE_URL=url, _env_file=None).DATABASE_URL == url


def test_cors_origins_are_split_and_trimmed():
    settings = Settings(CORS_ORIGINS=" https://mentora.vercel.app/ ,http://localhost:5173,", _env_file=None)
    assert settings.cors_origins == ["https://mentora.vercel.app", "http://localhost:5173"]
