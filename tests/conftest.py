import shutil
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.core import security
from app.core.config import settings
from app.db import get_db, make_engine
from app.main import app
from scripts.seed_admin import seed_admin
from tests.helpers import ADMIN_EMAIL, ADMIN_PASSWORD, login_headers

ROOT = Path(__file__).resolve().parent.parent

# bcrypt is slow by design; the cheapest cost factor keeps the suite fast.
security.pwd_context.update(bcrypt__rounds=4)


@pytest.fixture(scope="session")
def migrated_db(tmp_path_factory):
    """An empty SQLite file built once by running the real migrations."""
    path = tmp_path_factory.mktemp("template") / "template.db"
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(cfg, "head")
    return path


@pytest.fixture()
def engine(migrated_db, tmp_path):
    """A fresh temp database per test: a copy of the migrated template."""
    path = tmp_path / "test.db"
    shutil.copyfile(migrated_db, path)
    engine = make_engine(f"sqlite:///{path.as_posix()}")
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def upload_dir(tmp_path, monkeypatch):
    """Keep uploaded proof files out of the real uploads/ directory."""
    path = tmp_path / "uploads"
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(path))
    return path


@pytest.fixture()
def session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture()
def db(session_factory):
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def admin_headers(client, db):
    assert seed_admin(db, ADMIN_EMAIL, ADMIN_PASSWORD) is True
    return login_headers(client, ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture()
def client(session_factory):
    def override_get_db():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
