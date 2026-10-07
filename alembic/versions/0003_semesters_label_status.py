"""semesters: label, status, nullable start_date and deadlines

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

semester_status = sa.Enum('open', 'closed', name='semester_status')


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        # add_column does not create the enum type the way create_table does.
        semester_status.create(bind, checkfirst=True)

    # semesters has no partial indexes, so a batch rebuild on SQLite is safe.
    # The unique constraint is swapped in its own batch: creating it in the same
    # batch as the column rename silently loses it on SQLite.
    with op.batch_alter_table('semesters', schema=None) as batch_op:
        batch_op.drop_constraint('uq_semesters_name', type_='unique')
    with op.batch_alter_table('semesters', schema=None) as batch_op:
        batch_op.alter_column('name', new_column_name='label')
    with op.batch_alter_table('semesters', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_semesters_label', ['label'])
        batch_op.alter_column('start_date', existing_type=sa.Date(), nullable=True)
        batch_op.alter_column(
            'internal_deadline', existing_type=sa.DateTime(timezone=True), nullable=True
        )
        batch_op.alter_column(
            'result_deadline', existing_type=sa.DateTime(timezone=True), nullable=True
        )
        batch_op.add_column(
            sa.Column('status', semester_status, server_default='open', nullable=False)
        )
        batch_op.drop_column('end_date')
        batch_op.drop_column('is_current')


def downgrade() -> None:
    # Lossy by nature: end_date is restored from start_date and NULLs are filled.
    op.execute("UPDATE semesters SET start_date = CURRENT_DATE WHERE start_date IS NULL")
    op.execute(
        "UPDATE semesters SET internal_deadline = CURRENT_TIMESTAMP "
        "WHERE internal_deadline IS NULL"
    )
    op.execute(
        "UPDATE semesters SET result_deadline = CURRENT_TIMESTAMP "
        "WHERE result_deadline IS NULL"
    )
    with op.batch_alter_table('semesters', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_current', sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch_op.add_column(sa.Column('end_date', sa.Date(), nullable=True))
        batch_op.drop_column('status')
        batch_op.alter_column(
            'result_deadline', existing_type=sa.DateTime(timezone=True), nullable=False
        )
        batch_op.alter_column(
            'internal_deadline', existing_type=sa.DateTime(timezone=True), nullable=False
        )
        batch_op.alter_column('start_date', existing_type=sa.Date(), nullable=False)
        batch_op.drop_constraint('uq_semesters_label', type_='unique')
    with op.batch_alter_table('semesters', schema=None) as batch_op:
        batch_op.alter_column('label', new_column_name='name')
    with op.batch_alter_table('semesters', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_semesters_name', ['name'])

    op.execute("UPDATE semesters SET end_date = start_date")
    with op.batch_alter_table('semesters', schema=None) as batch_op:
        batch_op.alter_column('end_date', existing_type=sa.Date(), nullable=False)

    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        semester_status.drop(bind, checkfirst=True)
