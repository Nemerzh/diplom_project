"""simplify meter model: meter as accounting point

Revision ID: 0004_meter_without_meterpoint
Revises: 0003_topology_monitoring
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_meter_without_meterpoint"
down_revision = "0003_topology_monitoring"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meters", sa.Column("line_id", sa.Integer(), nullable=True))
    op.add_column("meters", sa.Column("zone_name", sa.String(length=255), nullable=True))
    op.add_column("meters", sa.Column("meter_role", sa.String(length=64), nullable=False, server_default="submeter"))
    op.add_column("meters", sa.Column("is_main_meter", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("meters", sa.Column("last_seen_at", sa.DateTime(), nullable=True))
    op.create_foreign_key("fk_meters_line_id", "meters", "electrical_lines", ["line_id"], ["id"])

    op.execute(
        """
        UPDATE meters m
        SET line_id = COALESCE(
            m.line_id,
            (SELECT s.line_id FROM sites s WHERE s.id = m.site_id),
            (SELECT mp.line_id FROM meter_points mp WHERE mp.id = m.meter_point_id)
        )
        """
    )
    op.execute("UPDATE meters SET zone_name = COALESCE(zone_name, 'main') WHERE zone_name IS NULL")

    op.alter_column("meters", "line_id", nullable=False)
    op.alter_column("meters", "zone_name", nullable=False)

    op.add_column("alerts", sa.Column("transformer_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_alerts_transformer_id", "alerts", "transformers", ["transformer_id"], ["id"])

    op.drop_constraint("fk_alerts_meter_point_id", "alerts", type_="foreignkey")
    op.drop_column("alerts", "meter_point_id")

    op.drop_constraint("fk_meters_meter_point_id", "meters", type_="foreignkey")
    op.drop_column("meters", "meter_point_id")
    op.drop_table("meter_points")


def downgrade() -> None:
    op.create_table(
        "meter_points",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("line_id", sa.Integer(), sa.ForeignKey("electrical_lines.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("point_type", sa.String(length=64), nullable=False, server_default="line_end"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.add_column("meters", sa.Column("meter_point_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_meters_meter_point_id", "meters", "meter_points", ["meter_point_id"], ["id"])

    op.add_column("alerts", sa.Column("meter_point_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_alerts_meter_point_id", "alerts", "meter_points", ["meter_point_id"], ["id"])

    op.drop_constraint("fk_alerts_transformer_id", "alerts", type_="foreignkey")
    op.drop_column("alerts", "transformer_id")

    op.drop_constraint("fk_meters_line_id", "meters", type_="foreignkey")
    op.drop_column("meters", "last_seen_at")
    op.drop_column("meters", "is_main_meter")
    op.drop_column("meters", "meter_role")
    op.drop_column("meters", "zone_name")
    op.drop_column("meters", "line_id")
