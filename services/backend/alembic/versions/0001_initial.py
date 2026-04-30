"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "enterprises",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "sites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("enterprise_id", sa.Integer(), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "meters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("serial_number", sa.String(length=255), nullable=False, unique=True),
        sa.Column("meter_type", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "raw_readings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meter_id", sa.Integer(), sa.ForeignKey("meters.id"), nullable=False),
        sa.Column("ts", sa.DateTime(), nullable=False),
        sa.Column("value_kwh", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("meter_id", "ts", "source", name="uq_raw_meter_ts_source"),
    )
    op.create_table(
        "validated_readings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("raw_reading_id", sa.Integer(), sa.ForeignKey("raw_readings.id"), nullable=False, unique=True),
        sa.Column("meter_id", sa.Integer(), sa.ForeignKey("meters.id"), nullable=False),
        sa.Column("ts", sa.DateTime(), nullable=False),
        sa.Column("value_kwh", sa.Float(), nullable=False),
        sa.Column("quality_flag", sa.String(length=32), nullable=False),
        sa.Column("issue", sa.Text(), nullable=True),
        sa.Column("validated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "daily_aggregations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meter_id", sa.Integer(), sa.ForeignKey("meters.id"), nullable=False),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("day", sa.DateTime(), nullable=False),
        sa.Column("total_kwh", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("meter_id", "day", name="uq_daily_meter_day"),
    )
    op.create_table(
        "monthly_aggregations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meter_id", sa.Integer(), sa.ForeignKey("meters.id"), nullable=False),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("month", sa.DateTime(), nullable=False),
        sa.Column("total_kwh", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("meter_id", "month", name="uq_monthly_meter_month"),
    )
    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=True),
        sa.Column("meter_id", sa.Integer(), sa.ForeignKey("meters.id"), nullable=True),
        sa.Column("rule_type", sa.String(length=64), nullable=False),
        sa.Column("threshold_kwh", sa.Float(), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("meter_id", sa.Integer(), sa.ForeignKey("meters.id"), nullable=True),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=True),
        sa.Column("alert_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=128), nullable=False, unique=True),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.execute(
        "INSERT INTO enterprises (id, name, created_at) VALUES (1, 'Demo Enterprise', NOW()) ON CONFLICT DO NOTHING;"
    )


def downgrade() -> None:
    op.drop_table("users")
    op.drop_table("alerts")
    op.drop_table("alert_rules")
    op.drop_table("monthly_aggregations")
    op.drop_table("daily_aggregations")
    op.drop_table("validated_readings")
    op.drop_table("raw_readings")
    op.drop_table("meters")
    op.drop_table("sites")
    op.drop_table("enterprises")
