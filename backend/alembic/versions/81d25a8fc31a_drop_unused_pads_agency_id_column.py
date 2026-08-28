"""drop unused pads agency_id column

Revision ID: 81d25a8fc31a
Revises: e7b8a1c2d4f6
Create Date: 2026-08-26 22:22:27.064510

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "81d25a8fc31a"
down_revision: Union[str, Sequence[str], None] = "e7b8a1c2d4f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # batch mode: needed for SQLite to drop columns (pre-3.35 SQLite has no
    # native ALTER TABLE DROP COLUMN; Alembic falls back to a copy-and-move
    # rebuild). Never set by sync, never read by the API - agencies are
    # reached through a pad's launches, not a direct pad->agency link.
    with op.batch_alter_table("pads") as batch_op:
        batch_op.drop_column("agency_id")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("pads") as batch_op:
        batch_op.add_column(
            sa.Column(
                "agency_id",
                sa.Integer(),
                sa.ForeignKey("agencies.id"),
                nullable=True,
            )
        )
