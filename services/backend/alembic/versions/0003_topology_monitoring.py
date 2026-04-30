"""topology monitoring: site.line_id, thresholds, load_snapshots, alert FKs

Revision ID: 0003_topology_monitoring
Revises: 0002_grid_model
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0003_topology_monitoring"
down_revision = "0002_grid_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sites", sa.Column("line_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_sites_line_id", "sites", "electrical_lines", ["line_id"], ["id"])

    op.add_column("substations", sa.Column("rated_capacity_kw", sa.Float(), nullable=True))
    op.add_column("substations", sa.Column("threshold_warning_kw", sa.Float(), nullable=True))
    op.add_column("substations", sa.Column("threshold_critical_kw", sa.Float(), nullable=True))
    op.add_column("substations", sa.Column("node_status", sa.String(length=32), nullable=False, server_default="normal"))

    op.add_column("electrical_lines", sa.Column("threshold_warning_kw", sa.Float(), nullable=True))
    op.add_column("electrical_lines", sa.Column("threshold_critical_kw", sa.Float(), nullable=True))
    op.add_column("electrical_lines", sa.Column("node_status", sa.String(length=32), nullable=False, server_default="normal"))

    op.add_column("alerts", sa.Column("substation_id", sa.Integer(), nullable=True))
    op.add_column("alerts", sa.Column("line_id", sa.Integer(), nullable=True))
    op.add_column("alerts", sa.Column("meter_point_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_alerts_substation_id", "alerts", "substations", ["substation_id"], ["id"])
    op.create_foreign_key("fk_alerts_line_id", "alerts", "electrical_lines", ["line_id"], ["id"])
    op.create_foreign_key("fk_alerts_meter_point_id", "alerts", "meter_points", ["meter_point_id"], ["id"])

    op.create_table(
        "load_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("node_type", sa.String(length=32), nullable=False),
        sa.Column("node_id", sa.Integer(), nullable=False),
        sa.Column("load_kw", sa.Float(), nullable=False, server_default="0"),
        sa.Column("node_status", sa.String(length=32), nullable=False, server_default="normal"),
        sa.Column("computed_at", sa.DateTime(), nullable=False),
    )
    op.create_unique_constraint("uq_load_snapshot_node", "load_snapshots", ["node_type", "node_id"])

    # Backfill site.line_id from first linked meter_point line
    op.execute(
        """
        UPDATE sites s SET line_id = (
            SELECT mp.line_id FROM meters m
            JOIN meter_points mp ON m.meter_point_id = mp.id
            WHERE m.site_id = s.id AND m.meter_point_id IS NOT NULL
            LIMIT 1
        ) WHERE s.line_id IS NULL;
        """
    )


def downgrade() -> None:
    op.drop_constraint("uq_load_snapshot_node", "load_snapshots", type_="unique")
    op.drop_table("load_snapshots")

    op.drop_constraint("fk_alerts_meter_point_id", "alerts", type_="foreignkey")
    op.drop_constraint("fk_alerts_line_id", "alerts", type_="foreignkey")
    op.drop_constraint("fk_alerts_substation_id", "alerts", type_="foreignkey")
    op.drop_column("alerts", "meter_point_id")
    op.drop_column("alerts", "line_id")
    op.drop_column("alerts", "substation_id")

    op.drop_column("electrical_lines", "node_status")
    op.drop_column("electrical_lines", "threshold_critical_kw")
    op.drop_column("electrical_lines", "threshold_warning_kw")

    op.drop_column("substations", "node_status")
    op.drop_column("substations", "threshold_critical_kw")
    op.drop_column("substations", "threshold_warning_kw")
    op.drop_column("substations", "rated_capacity_kw")

    op.drop_constraint("fk_sites_line_id", "sites", type_="foreignkey")
    op.drop_column("sites", "line_id")
