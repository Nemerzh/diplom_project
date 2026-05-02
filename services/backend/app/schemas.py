from datetime import datetime

from pydantic import BaseModel, Field


class SiteCreate(BaseModel):
    enterprise_id: int
    name: str
    location: str | None = None
    line_id: int | None = None


class SiteOut(BaseModel):
    id: int
    enterprise_id: int
    line_id: int | None = None
    name: str
    location: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class EnterpriseOut(BaseModel):
    id: int
    name: str
    city_id: int | None = None

    class Config:
        from_attributes = True


class EnterpriseCreate(BaseModel):
    name: str
    city_id: int | None = None


class CityCreate(BaseModel):
    name: str
    region: str | None = None


class CityOut(BaseModel):
    id: int
    name: str
    region: str | None = None

    class Config:
        from_attributes = True


class SubstationCreate(BaseModel):
    enterprise_id: int
    code: str
    name: str
    voltage_in_kv: float | None = None
    voltage_out_kv: float | None = None
    rated_capacity_kw: float | None = None
    threshold_warning_kw: float | None = None
    threshold_critical_kw: float | None = None


class SubstationOut(BaseModel):
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


class SubstationThresholdsUpdate(BaseModel):
    rated_capacity_kw: float | None = None
    threshold_warning_kw: float | None = None
    threshold_critical_kw: float | None = None


class TransformerCreate(BaseModel):
    substation_id: int
    code: str
    name: str
    rated_power_kva: float | None = None
    voltage_in_kv: float | None = None
    voltage_out_kv: float | None = None
    status: str = "active"


class TransformerOut(BaseModel):
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


class ElectricalLineCreate(BaseModel):
    transformer_id: int
    code: str
    name: str
    voltage_kv: float | None = None
    status: str = "active"


class ElectricalLineOut(BaseModel):
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


class LineThresholdsUpdate(BaseModel):
    threshold_warning_kw: float | None = None
    threshold_critical_kw: float | None = None


class MeterCreate(BaseModel):
    site_id: int
    line_id: int
    zone_name: str
    meter_role: str = "workshop_zone"
    serial_number: str
    meter_type: str = "electricity"
    status: str = "active"
    last_seen_at: datetime | None = None


class MeterOut(BaseModel):
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


class ReadingIn(BaseModel):
    meter_id: int
    ts: datetime
    value_kwh: float = Field(ge=0)
    source: str = "api"


class ReadingOut(BaseModel):
    id: int
    meter_id: int
    ts: datetime
    value_kwh: float
    source: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class AlertRuleIn(BaseModel):
    site_id: int | None = None
    meter_id: int | None = None
    rule_type: str = "threshold"
    threshold_kwh: float = Field(gt=0)
    severity: str = "medium"
    window_days: int = Field(default=30, ge=1, le=366)
    enabled: bool = True


class AlertRuleOut(BaseModel):
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
