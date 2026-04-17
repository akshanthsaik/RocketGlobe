"""Add sync_runs table

Revision ID: e7b8a1c2d4f6
Revises: d3f5a7298b6c
Create Date: 2026-02-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e7b8a1c2d4f6"
down_revision = "d3f5a7298b6c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sync_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("current_resource", sa.String(length=64), nullable=True),
        sa.Column("progress_done", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("progress_total", sa.Integer(), nullable=False, server_default=sa.text("4")),
        sa.Column("stats", sa.JSON(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_sync_runs_id"), "sync_runs", ["id"], unique=False)
    op.create_index(op.f("ix_sync_runs_run_id"), "sync_runs", ["run_id"], unique=True)
    op.create_index(op.f("ix_sync_runs_status"), "sync_runs", ["status"], unique=False)
    op.create_index(op.f("ix_sync_runs_is_active"), "sync_runs", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sync_runs_is_active"), table_name="sync_runs")
    op.drop_index(op.f("ix_sync_runs_status"), table_name="sync_runs")
    op.drop_index(op.f("ix_sync_runs_run_id"), table_name="sync_runs")
    op.drop_index(op.f("ix_sync_runs_id"), table_name="sync_runs")
    op.drop_table("sync_runs")
