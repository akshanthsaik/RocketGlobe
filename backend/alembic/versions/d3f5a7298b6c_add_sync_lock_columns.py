"""Add lock columns to sync_state

Revision ID: d3f5a7298b6c
Revises: c6d7a21f4b3b
Create Date: 2026-01-01 00:10:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd3f5a7298b6c'
down_revision = 'c6d7a21f4b3b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('sync_state', sa.Column('is_locked', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('sync_state', sa.Column('lock_owner', sa.String(length=256), nullable=True))
    op.add_column('sync_state', sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # batch mode: needed for SQLite to drop columns (pre-3.35 SQLite has no native
    # ALTER TABLE DROP COLUMN; Alembic falls back to a copy-and-move rebuild).
    with op.batch_alter_table('sync_state') as batch_op:
        batch_op.drop_column('locked_at')
        batch_op.drop_column('lock_owner')
        batch_op.drop_column('is_locked')
