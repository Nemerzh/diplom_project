"""grid model entities

Revision ID: 0002_grid_model
Revises: 0001_initial
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_grid_model"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False, unique=True),
        sa.Column("region", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.add_column("enterprises", sa.Column("city_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_enterprises_city_id", "enterprises", "cities", ["city_id"], ["id"])

    op.create_table(
        "substations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("enterprise_id", sa.Integer(), sa.ForeignKey("enterprises.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("voltage_in_kv", sa.Float(), nullable=True),
        sa.Column("voltage_out_kv", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "transformers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("substation_id", sa.Integer(), sa.ForeignKey("substations.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("rated_power_kva", sa.Float(), nullable=True),
        sa.Column("voltage_in_kv", sa.Float(), nullable=True),
        sa.Column("voltage_out_kv", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "electrical_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transformer_id", sa.Integer(), sa.ForeignKey("transformers.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("voltage_kv", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "meter_points",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("line_id", sa.Integer(), sa.ForeignKey("electrical_lines.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("point_type", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.add_column("meters", sa.Column("meter_point_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_meters_meter_point_id", "meters", "meter_points", ["meter_point_id"], ["id"])

    op.execute(
        "INSERT INTO cities (id, name, region, created_at) VALUES (1, 'Львів', 'Львівська область', NOW()) ON CONFLICT DO NOTHING;"
    )
    op.execute("UPDATE enterprises SET city_id = 1 WHERE id = 1;")


def downgrade() -> None:
    op.drop_constraint("fk_meters_meter_point_id", "meters", type_="foreignkey")
    op.drop_column("meters", "meter_point_id")
    op.drop_table("meter_points")
    op.drop_table("electrical_lines")
    op.drop_table("transformers")
    op.drop_table("substations")
    op.drop_constraint("fk_enterprises_city_id", "enterprises", type_="foreignkey")
    op.drop_column("enterprises", "city_id")
    op.drop_table("cities")
