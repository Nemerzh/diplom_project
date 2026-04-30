"""enforce one main meter per site

Revision ID: 0005_one_main_meter_per_site
Revises: 0004_meter_without_meterpoint
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_one_main_meter_per_site"
down_revision = "0004_meter_without_meterpoint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_meters_main_per_site",
        "meters",
        ["site_id"],
        unique=True,
        postgresql_where=sa.text("is_main_meter = true"),
    )


def downgrade() -> None:
    op.drop_index("uq_meters_main_per_site", table_name="meters")
