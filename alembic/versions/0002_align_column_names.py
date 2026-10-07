"""align column names with the API contract vocabulary

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-05

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, old name, new name)
RENAMES = (
    ('allocations', 'end_date', 'ended_at'),
    ('internal_marks', 'max_marks', 'max_per_test'),
    ('result_subjects', 'marks', 'final_marks'),
)


def upgrade() -> None:
    # Plain RENAME COLUMN works on SQLite (3.25+) and PostgreSQL, and unlike a
    # batch table rebuild it cannot drop the partial unique indexes.
    for table, old, new in RENAMES:
        op.execute(f'ALTER TABLE {table} RENAME COLUMN {old} TO {new}')


def downgrade() -> None:
    for table, old, new in reversed(RENAMES):
        op.execute(f'ALTER TABLE {table} RENAME COLUMN {new} TO {old}')
