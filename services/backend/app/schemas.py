from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator


class _UtcAwareModel(BaseModel):
    """Базовий клас: усі поля ``datetime`` нормалізуються до tz-aware UTC.

    Колонки БД у нас зберігаються як ``timestamp without time zone`` із семантикою
    UTC. SQLAlchemy віддає їх у Python як naive datetime — pydantic v2 у такому
    випадку серіалізує його як ISO без offset. Цей валідатор приводить будь-який
    naive datetime до tz-aware UTC, після чого pydantic уже сам додасть
    ``+00:00``/``Z`` у JSON.
    """

    @field_validator("*", mode="before")
    @classmethod
    def _coerce_naive_datetime_to_utc(cls, value):
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class SiteCreate(_UtcAwareModel):
    enterprise_id: int
    name: str
    location: str | None = None
    line_id: int | None = None


class SiteOut(_UtcAwareModel):
    id: int
    enterprise_id: int
    line_id: int | None = None
    name: str
    location: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class EnterpriseOut(_UtcAwareModel):
    id: int
    name: str
    city_id: int | None = None

    class Config:
        from_attributes = True


class EnterpriseCreate(_UtcAwareModel):
    name: str
    city_id: int | None = None


class CityCreate(_UtcAwareModel):
    name: str
    region: str | None = None


class CityOut(_UtcAwareModel):
    id: int
    name: str
    region: str | None = None

    class Config:
        from_attributes = True


class SubstationCreate(_UtcAwareModel):
    enterprise_id: int
    code: str
    name: str
    voltage_in_kv: float | None = None
    voltage_out_kv: float | None = None
    rated_capacity_kw: float | None = None
    threshold_warning_kw: float | None = None
    threshold_critical_kw: float | None = None


class SubstationOut(_UtcAwareModel):
    id: int
    enterprise_id: int
    code: str
    name: str
    voltage_in_kv: float | None = None
    voltage_out_kv: float | None = None
    rated_capacity_kw: float | None = None
    threshold_warning_kw: float | None = None
    threshold_critical_kw: float | None = None
    node_status: str | None = None

    class Config:
        from_attributes = True


class SubstationThresholdsUpdate(_UtcAwareModel):
    rated_capacity_kw: float | None = None
    threshold_warning_kw: float | None = None
    threshold_critical_kw: float | None = None


class TransformerCreate(_UtcAwareModel):
    substation_id: int
    code: str
    name: str
    rated_power_kva: float | None = None
    voltage_in_kv: float | None = None
    voltage_out_kv: float | None = None
    status: str = "active"


class TransformerOut(_UtcAwareModel):
    id: int
    substation_id: int
    code: str
    name: str
    rated_power_kva: float | None = None
    voltage_in_kv: float | None = None
    voltage_out_kv: float | None = None
    status: str

    class Config:
        from_attributes = True


class ElectricalLineCreate(_UtcAwareModel):
    transformer_id: int
    code: str
    name: str
    voltage_kv: float | None = None
    status: str = "active"


class ElectricalLineOut(_UtcAwareModel):
    id: int
    transformer_id: int
    code: str
    name: str
    voltage_kv: float | None = None
    status: str
    threshold_warning_kw: float | None = None
    threshold_critical_kw: float | None = None
    node_status: str | None = None

    class Config:
        from_attributes = True


class LineThresholdsUpdate(_UtcAwareModel):
    threshold_warning_kw: float | None = None
    threshold_critical_kw: float | None = None


class MeterCreate(_UtcAwareModel):
    site_id: int
    line_id: int
    zone_name: str
    meter_role: str = "workshop_zone"
    serial_number: str
    meter_type: str = "electricity"
    status: str = "active"
    last_seen_at: datetime | None = None


class MeterOut(_UtcAwareModel):
    id: int
    site_id: int
    line_id: int
    zone_name: str
    meter_role: str
    is_main_meter: bool = False
    serial_number: str
    meter_type: str
    status: str
    last_seen_at: datetime | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class ReadingIn(_UtcAwareModel):
    meter_id: int
    ts: datetime
    value_kwh: float = Field(ge=0)
    source: str = "api"


class ReadingOut(_UtcAwareModel):
    id: int
    meter_id: int
    ts: datetime
    value_kwh: float
    source: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class AlertRuleIn(_UtcAwareModel):
    site_id: int | None = None
    meter_id: int | None = None
    rule_type: str = "threshold"
    threshold_kwh: float = Field(gt=0)
    severity: str = "medium"
    window_days: int = Field(default=30, ge=1, le=366)
    enabled: bool = True


class AlertRuleOut(_UtcAwareModel):
    id: int
    site_id: int | None = None
    meter_id: int | None = None
    rule_type: str
    threshold_kwh: float
    severity: str
    window_days: int = 30
    enabled: bool
    created_at: datetime | None = None

    class Config:
        from_attributes = True
