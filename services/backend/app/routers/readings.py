from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.metrics import RECEIVED_READINGS_TOTAL
from app.models import Meter, RawReading
from app.schemas import ReadingIn, ReadingOut

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
    return entity


@router.get("/readings", response_model=list[ReadingOut])
def get_readings(limit: int = 200, db: Session = Depends(get_db)):
    return db.query(RawReading).order_by(RawReading.ts.desc()).limit(limit).all()


@router.get("/readings/{meter_id}", response_model=list[ReadingOut])
def get_meter_readings(meter_id: int, limit: int = 200, db: Session = Depends(get_db)):
    return (
        db.query(RawReading)
        .filter(RawReading.meter_id == meter_id)
        .order_by(RawReading.ts.desc())
        .limit(limit)
        .all()
    )
