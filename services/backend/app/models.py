import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.utils.timeutils import now_utc


class MeterStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    maintenance = "maintenance"


class Enterprise(Base):
    __tablename__ = "enterprises"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    city = relationship("City", back_populates="enterprises")
    sites = relationship("Site", back_populates="enterprise")
    substations = relationship("Substation", back_populates="enterprise")


class City(Base):
    __tablename__ = "cities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    region: Mapped[str] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    enterprises = relationship("Enterprise", back_populates="city")


class Site(Base):
    __tablename__ = "sites"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    enterprise_id: Mapped[int] = mapped_column(ForeignKey("enterprises.id"), nullable=False)
    line_id: Mapped[int | None] = mapped_column(ForeignKey("electrical_lines.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    enterprise = relationship("Enterprise", back_populates="sites")
    line = relationship("ElectricalLine", back_populates="sites")
    meters = relationship("Meter", back_populates="site")


class Meter(Base):
    __tablename__ = "meters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False)
    line_id: Mapped[int] = mapped_column(ForeignKey("electrical_lines.id"), nullable=False, index=True)
    serial_number: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    zone_name: Mapped[str] = mapped_column(String(255), nullable=False)
    meter_role: Mapped[str] = mapped_column(String(64), nullable=False, default="submeter")
    is_main_meter: Mapped[bool] = mapped_column(nullable=False, default=False)
    meter_type: Mapped[str] = mapped_column(String(128), nullable=False, default="electricity")
    # БД з Alembic — VARCHAR, не окремий тип PostgreSQL ENUM (без цього INSERT дає «type meterstatus does not exist»).
    status: Mapped[MeterStatus] = mapped_column(
        Enum(MeterStatus, native_enum=False, values_callable=lambda x: [i.value for i in x]),
        default=MeterStatus.active,
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    site = relationship("Site", back_populates="meters")
    line = relationship("ElectricalLine")


class Substation(Base):
    __tablename__ = "substations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    enterprise_id: Mapped[int] = mapped_column(ForeignKey("enterprises.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    voltage_in_kv: Mapped[float] = mapped_column(Float, nullable=True)
    voltage_out_kv: Mapped[float] = mapped_column(Float, nullable=True)
    rated_capacity_kw: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_warning_kw: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_critical_kw: Mapped[float | None] = mapped_column(Float, nullable=True)
    node_status: Mapped[str] = mapped_column(String(32), nullable=False, default="normal")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    enterprise = relationship("Enterprise", back_populates="substations")
    transformers = relationship("Transformer", back_populates="substation")


class Transformer(Base):
    __tablename__ = "transformers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    substation_id: Mapped[int] = mapped_column(ForeignKey("substations.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    rated_power_kva: Mapped[float] = mapped_column(Float, nullable=True)
    voltage_in_kv: Mapped[float] = mapped_column(Float, nullable=True)
    voltage_out_kv: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    substation = relationship("Substation", back_populates="transformers")
    lines = relationship("ElectricalLine", back_populates="transformer")


class ElectricalLine(Base):
    __tablename__ = "electrical_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    transformer_id: Mapped[int] = mapped_column(ForeignKey("transformers.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    voltage_kv: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    threshold_warning_kw: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_critical_kw: Mapped[float | None] = mapped_column(Float, nullable=True)
    node_status: Mapped[str] = mapped_column(String(32), nullable=False, default="normal")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    transformer = relationship("Transformer", back_populates="lines")
    sites = relationship("Site", back_populates="line")


class RawReading(Base):
    __tablename__ = "raw_readings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meter_id: Mapped[int] = mapped_column(ForeignKey("meters.id"), nullable=False, index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    value_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="api")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    __table_args__ = (UniqueConstraint("meter_id", "ts", "source", name="uq_raw_meter_ts_source"),)


class ValidatedReading(Base):
    __tablename__ = "validated_readings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    raw_reading_id: Mapped[int] = mapped_column(ForeignKey("raw_readings.id"), unique=True, nullable=False)
    meter_id: Mapped[int] = mapped_column(ForeignKey("meters.id"), nullable=False, index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    value_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    quality_flag: Mapped[str] = mapped_column(String(32), nullable=False, default="OK")
    issue: Mapped[str] = mapped_column(Text, nullable=True)
    validated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)


class DailyAggregation(Base):
    __tablename__ = "daily_aggregations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meter_id: Mapped[int] = mapped_column(ForeignKey("meters.id"), index=True, nullable=False)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True, nullable=False)
    day: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    total_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    __table_args__ = (UniqueConstraint("meter_id", "day", name="uq_daily_meter_day"),)


class MonthlyAggregation(Base):
    __tablename__ = "monthly_aggregations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meter_id: Mapped[int] = mapped_column(ForeignKey("meters.id"), index=True, nullable=False)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True, nullable=False)
    month: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    total_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    __table_args__ = (UniqueConstraint("meter_id", "month", name="uq_monthly_meter_month"),)


class AlertRule(Base):
    __tablename__ = "alert_rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=True)
    meter_id: Mapped[int] = mapped_column(ForeignKey("meters.id"), nullable=True)
    rule_type: Mapped[str] = mapped_column(String(64), default="threshold")
    threshold_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=500)
    severity: Mapped[str] = mapped_column(String(32), nullable=False, default="medium")
    window_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("alert_rules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    meter_id: Mapped[int] = mapped_column(ForeignKey("meters.id"), nullable=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=True)
    substation_id: Mapped[int | None] = mapped_column(ForeignKey("substations.id"), nullable=True, index=True)
    transformer_id: Mapped[int | None] = mapped_column(ForeignKey("transformers.id"), nullable=True, index=True)
    line_id: Mapped[int | None] = mapped_column(ForeignKey("electrical_lines.id"), nullable=True, index=True)
    alert_type: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    resolved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)


class LoadSnapshot(Base):
    """Останнє обчислене навантаження по вузлу топології (upsert при перерахунку)."""

    __tablename__ = "load_snapshots"
    __table_args__ = (UniqueConstraint("node_type", "node_id", name="uq_load_snapshot_node"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    node_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    node_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    load_kw: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    node_status: Mapped[str] = mapped_column(String(32), nullable=False, default="normal")
    computed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(64), nullable=False, default="operator")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
