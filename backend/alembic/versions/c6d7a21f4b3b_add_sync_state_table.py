"""Add sync_state table

Revision ID: c6d7a21f4b3b
Revises: bf35ea52e36f
Create Date: 2026-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c6d7a21f4b3b'
down_revision = 'bf35ea52e36f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Unique constraint is declared inline on create_table (rather than a separate
    # ALTER ... ADD CONSTRAINT) since SQLite can only add constraints via Alembic's
    # batch (copy-and-move) mode, and there's no need for that when the table is new.
    op.create_table(
        'sync_state',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('resource', sa.String(length=128), nullable=False),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('resource', name='uq_sync_state_resource'),
    )
    op.create_index(op.f('ix_sync_state_resource'), 'sync_state', ['resource'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_sync_state_resource'), table_name='sync_state')
    op.drop_table('sync_state')
