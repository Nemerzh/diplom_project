"""alert_rules.window_days, alerts.alert_rule_id for dedup

Revision ID: 0006_win_days_rule_fk (<=32 chars for alembic_version)
Revises: 0005_one_main_meter_per_site
Create Date: 2026-05-01
"""
from alembic import op
import sqlalchemy as sa


revision = "0006_win_days_rule_fk"
down_revision = "0005_one_main_meter_per_site"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "alert_rules",
        sa.Column("window_days", sa.Integer(), nullable=False, server_default="30"),
    )
    op.add_column("alerts", sa.Column("alert_rule_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_alerts_alert_rule_id",
        "alerts",
        "alert_rules",
        ["alert_rule_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_alerts_alert_rule_id", "alerts", ["alert_rule_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_alerts_alert_rule_id", table_name="alerts")
    op.drop_constraint("fk_alerts_alert_rule_id", "alerts", type_="foreignkey")
    op.drop_column("alerts", "alert_rule_id")
    op.drop_column("alert_rules", "window_days")
