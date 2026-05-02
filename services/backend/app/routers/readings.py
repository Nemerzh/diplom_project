import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.metrics import RECEIVED_READINGS_TOTAL
from app.models import Meter, RawReading
from app.schemas import ReadingIn, ReadingOut
from app.services.threshold_alerts import evaluate_threshold_rules
from app.services.validation_sync import sync_validated_readings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["readings"])


@router.post("/readings", response_model=ReadingOut)
def create_reading(payload: ReadingIn, db: Session = Depends(get_db)):
    meter = db.query(Meter).filter(Meter.id == payload.meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="лічильник не знайдено")
    entity = RawReading(**payload.model_dump())
    db.add(entity)
    meter.last_seen_at = payload.ts
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="дубльований показ") from None
    db.refresh(entity)
    RECEIVED_READINGS_TOTAL.inc()
    try:
        sync_validated_readings(db)
        evaluate_threshold_rules(db)
    except Exception:
        logger.exception("після збереження показу не вдалося синхронізувати валідацію або перевірити пороги")
    return entity


@router.get("/readings", response_model=list[ReadingOut])
def get_readings(limit: int = Query(default=500, ge=1, le=2000), db: Session = Depends(get_db)):
    return db.query(RawReading).order_by(RawReading.ts.desc()).limit(limit).all()


@router.get("/readings/{meter_id}", response_model=list[ReadingOut])
def get_meter_readings(meter_id: int, limit: int = Query(default=500, ge=1, le=2000), db: Session = Depends(get_db)):
    return (
        db.query(RawReading)
        .filter(RawReading.meter_id == meter_id)
        .order_by(RawReading.ts.desc())
        .limit(limit)
        .all()
    )
