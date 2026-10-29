"""meetings, group_sessions: rem_24_sent / rem_1h_sent reminder flags

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, Sequence[str], None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ('meetings', 'group_sessions')
COLUMNS = ('rem_24_sent', 'rem_1h_sent')


def upgrade() -> None:
    # Plain ADD COLUMN: meetings carries a partial unique index, so no batch rebuild.
    for table in TABLES:
        for column in COLUMNS:
            op.add_column(
                table,
                sa.Column(column, sa.Boolean(), server_default=sa.false(), nullable=False),
            )


def downgrade() -> None:
    for table in TABLES:
        for column in COLUMNS:
            op.drop_column(table, column)
