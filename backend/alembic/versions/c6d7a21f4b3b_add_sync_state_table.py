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
    op.create_table(
        'sync_state',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('resource', sa.String(length=128), nullable=False),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_sync_state_resource'), 'sync_state', ['resource'], unique=False)
    op.create_unique_constraint('uq_sync_state_resource', 'sync_state', ['resource'])


def downgrade() -> None:
    op.drop_constraint('uq_sync_state_resource', 'sync_state', type_='unique')
    op.drop_index(op.f('ix_sync_state_resource'), table_name='sync_state')
    op.drop_table('sync_state')
