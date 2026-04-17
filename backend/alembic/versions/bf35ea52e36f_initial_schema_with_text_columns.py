"""Initial schema

Revision ID: bf35ea52e36f
Revises:
Create Date: 2025-12-16 17:30:52.196429
"""

from typing import Sequence, Union

from alembic import op
from geoalchemy2 import Geography
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "bf35ea52e36f"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create application tables."""
    op.create_table(
        "agencies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ll2_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("abbrev", sa.Text(), nullable=True),
        sa.Column("type", sa.Text(), nullable=True),
        sa.Column("country_code", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("administrator", sa.Text(), nullable=True),
        sa.Column("founding_year", sa.Integer(), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(op.f("ix_agencies_id"), "agencies", ["id"], unique=False)
    op.create_index(op.f("ix_agencies_ll2_id"), "agencies", ["ll2_id"], unique=True)
    op.create_index(op.f("ix_agencies_name"), "agencies", ["name"], unique=False)
    op.create_index(op.f("ix_agencies_country_code"), "agencies", ["country_code"], unique=False)

    op.create_table(
        "pads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ll2_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("location", Geography(geometry_type="POINT", srid=4326), nullable=True),
        sa.Column("country_code", sa.Text(), nullable=True),
        sa.Column("map_url", sa.Text(), nullable=True),
        sa.Column("total_launch_count", sa.Integer(), nullable=True),
        sa.Column("agency_id", sa.Integer(), sa.ForeignKey("agencies.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(op.f("ix_pads_id"), "pads", ["id"], unique=False)
    op.create_index(op.f("ix_pads_ll2_id"), "pads", ["ll2_id"], unique=True)
    op.create_index(op.f("ix_pads_country_code"), "pads", ["country_code"], unique=False)

    op.create_table(
        "rockets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ll2_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("family", sa.Text(), nullable=True),
        sa.Column("full_name", sa.Text(), nullable=True),
        sa.Column("variant", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("length", sa.Float(), nullable=True),
        sa.Column("diameter", sa.Float(), nullable=True),
        sa.Column("leo_capacity", sa.Integer(), nullable=True),
        sa.Column("gto_capacity", sa.Integer(), nullable=True),
        sa.Column("launch_mass", sa.Integer(), nullable=True),
        sa.Column("thrust", sa.Integer(), nullable=True),
        sa.Column("is_reusable", sa.Boolean(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("manufacturer_id", sa.Integer(), sa.ForeignKey("agencies.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(op.f("ix_rockets_id"), "rockets", ["id"], unique=False)
    op.create_index(op.f("ix_rockets_ll2_id"), "rockets", ["ll2_id"], unique=True)
    op.create_index(op.f("ix_rockets_name"), "rockets", ["name"], unique=False)

    op.create_table(
        "launches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ll2_id", sa.String(length=100), nullable=True),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("net", sa.DateTime(), nullable=True),
        sa.Column("window_end", sa.DateTime(), nullable=True),
        sa.Column("window_start", sa.DateTime(), nullable=True),
        sa.Column("mission_name", sa.String(length=500), nullable=True),
        sa.Column("mission_description", sa.Text(), nullable=True),
        sa.Column("mission_type", sa.String(length=100), nullable=True),
        sa.Column("orbit", sa.String(length=100), nullable=True),
        sa.Column("webcast_live", sa.Boolean(), nullable=True),
        sa.Column("video_url", sa.String(length=500), nullable=True),
        sa.Column("pad_id", sa.Integer(), sa.ForeignKey("pads.id"), nullable=True),
        sa.Column("rocket_id", sa.Integer(), sa.ForeignKey("rockets.id"), nullable=True),
        sa.Column("agency_id", sa.Integer(), sa.ForeignKey("agencies.id"), nullable=True),
        sa.Column("raw_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(op.f("ix_launches_id"), "launches", ["id"], unique=False)
    op.create_index(op.f("ix_launches_ll2_id"), "launches", ["ll2_id"], unique=True)
    op.create_index(op.f("ix_launches_name"), "launches", ["name"], unique=False)
    op.create_index(op.f("ix_launches_status"), "launches", ["status"], unique=False)
    op.create_index(op.f("ix_launches_net"), "launches", ["net"], unique=False)
    op.create_index(op.f("ix_launches_mission_type"), "launches", ["mission_type"], unique=False)
    op.create_index(op.f("ix_launches_orbit"), "launches", ["orbit"], unique=False)
    op.create_index(op.f("ix_launches_pad_id"), "launches", ["pad_id"], unique=False)
    op.create_index(op.f("ix_launches_rocket_id"), "launches", ["rocket_id"], unique=False)
    op.create_index(op.f("ix_launches_agency_id"), "launches", ["agency_id"], unique=False)


def downgrade() -> None:
    """Drop application tables."""
    op.drop_index(op.f("ix_launches_agency_id"), table_name="launches")
    op.drop_index(op.f("ix_launches_rocket_id"), table_name="launches")
    op.drop_index(op.f("ix_launches_pad_id"), table_name="launches")
    op.drop_index(op.f("ix_launches_orbit"), table_name="launches")
    op.drop_index(op.f("ix_launches_mission_type"), table_name="launches")
    op.drop_index(op.f("ix_launches_net"), table_name="launches")
    op.drop_index(op.f("ix_launches_status"), table_name="launches")
    op.drop_index(op.f("ix_launches_name"), table_name="launches")
    op.drop_index(op.f("ix_launches_ll2_id"), table_name="launches")
    op.drop_index(op.f("ix_launches_id"), table_name="launches")
    op.drop_table("launches")

    op.drop_index(op.f("ix_rockets_name"), table_name="rockets")
    op.drop_index(op.f("ix_rockets_ll2_id"), table_name="rockets")
    op.drop_index(op.f("ix_rockets_id"), table_name="rockets")
    op.drop_table("rockets")

    op.drop_index(op.f("ix_pads_country_code"), table_name="pads")
    op.drop_index(op.f("ix_pads_ll2_id"), table_name="pads")
    op.drop_index(op.f("ix_pads_id"), table_name="pads")
    op.drop_table("pads")

    op.drop_index(op.f("ix_agencies_country_code"), table_name="agencies")
    op.drop_index(op.f("ix_agencies_name"), table_name="agencies")
    op.drop_index(op.f("ix_agencies_ll2_id"), table_name="agencies")
    op.drop_index(op.f("ix_agencies_id"), table_name="agencies")
    op.drop_table("agencies")
