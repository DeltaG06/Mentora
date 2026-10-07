from logging.config import fileConfig

from alembic import context

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.core.config import settings
from app.db import Base, make_engine
from app.models.types import UTCDateTime

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

# A caller (e.g. the test suite) may set sqlalchemy.url; otherwise use Settings.
database_url = config.get_main_option("sqlalchemy.url") or settings.DATABASE_URL


def render_item(type_, obj, autogen_context):
    # Keep migrations free of app imports: UTCDateTime is DateTime(timezone=True).
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime(timezone=True)"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_item=render_item,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = make_engine(database_url)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_item=render_item,
            # SQLite cannot ALTER most things in place.
            render_as_batch=connection.dialect.name == "sqlite",
        )

        with context.begin_transaction():
            context.run_migrations()

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
