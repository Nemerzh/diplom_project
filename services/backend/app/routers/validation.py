from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.metrics import VALIDATED_READINGS_TOTAL
from app.models import RawReading, ValidatedReading

router = APIRouter(prefix="/validation", tags=["validation"])


@router.post("/run")
def run_validation(db: Session = Depends(get_db)):
    raws = db.query(RawReading).order_by(RawReading.meter_id.asc(), RawReading.ts.asc()).all()
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
        inserted += 1
        VALIDATED_READINGS_TOTAL.inc()
    db.commit()
    return {"validated_inserted": inserted}


@router.get("/issues")
def get_validation_issues(limit: int = 200, db: Session = Depends(get_db)):
    rows = (
        db.query(ValidatedReading)
        .filter(ValidatedReading.quality_flag != "OK")
        .order_by(ValidatedReading.ts.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "meter_id": r.meter_id,
            "ts": r.ts,
            "quality_flag": r.quality_flag,
            "issue": r.issue,
        }
        for r in rows
    ]
