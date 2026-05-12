"""Перенесення сирих показів у validated_readings з базовими прапорцями якості."""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.metrics import VALIDATED_READINGS_TOTAL
from app.models import Meter, RawReading, ValidatedReading
from app.services.aggregation_rollup import bump_daily_monthly_totals


def sync_validated_readings(db: Session) -> int:
    raws = db.query(RawReading).order_by(RawReading.meter_id.asc(), RawReading.ts.asc()).all()
    site_by_meter_id = dict(db.query(Meter.id, Meter.site_id).all())
    latest_by_meter: dict[int, RawReading] = {}
    inserted = 0
    for raw in raws:
        exists = db.query(ValidatedReading).filter(ValidatedReading.raw_reading_id == raw.id).first()
        if exists:
            continue
        quality_flag = "OK"
        issue = None
        prev = latest_by_meter.get(raw.meter_id)
        if raw.value_kwh < 0:
            quality_flag = "BAD"
            issue = "negative_value"
        elif prev and raw.ts - prev.ts > timedelta(minutes=30):
            quality_flag = "WARN"
            issue = "gap_detected"
        elif prev and prev.value_kwh > 0 and (raw.value_kwh / prev.value_kwh) > 5:
            quality_flag = "WARN"
            issue = "spike_detected"
        record = ValidatedReading(
            raw_reading_id=raw.id,
            meter_id=raw.meter_id,
            ts=raw.ts,
            value_kwh=raw.value_kwh,
            quality_flag=quality_flag,
            issue=issue,
        )
        db.add(record)
        latest_by_meter[raw.meter_id] = raw
        site_id = site_by_meter_id.get(raw.meter_id)
        if site_id is not None:
            bump_daily_monthly_totals(
                db, meter_id=raw.meter_id, site_id=site_id, ts=raw.ts, delta_kwh=raw.value_kwh
            )
        inserted += 1
        VALIDATED_READINGS_TOTAL.inc()
    db.commit()
    return inserted
