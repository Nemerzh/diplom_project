from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ValidatedReading
from app.services.validation_sync import sync_validated_readings

router = APIRouter(prefix="/validation", tags=["validation"])


@router.post("/run")
def run_validation(db: Session = Depends(get_db)):
    inserted = sync_validated_readings(db)
    return {"validated_inserted": inserted}


@router.get("/issues")
def get_validation_issues(limit: int = Query(default=800, ge=1, le=2000), db: Session = Depends(get_db)):
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
