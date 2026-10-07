"""internal_submissions: drop proof_url (only semester results carry a proof)

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Native DROP COLUMN (SQLite 3.35+, PostgreSQL). A batch rebuild is avoided
    # because this table carries a partial unique index.
    op.drop_column('internal_submissions', 'proof_url')


def downgrade() -> None:
    op.add_column(
        'internal_submissions',
        sa.Column('proof_url', sa.String(length=500), server_default='', nullable=False),
    )
