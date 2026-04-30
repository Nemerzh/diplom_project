from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.metrics import ALERTS_GENERATED_TOTAL
from app.models import Alert, AlertRule, DailyAggregation, Meter, Site
from app.schemas import AlertRuleIn, AlertRuleOut

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _validate_rule_targets(payload: AlertRuleIn, db: Session) -> None:
    site = None
    meter = None
    if payload.site_id is not None:
        site = db.query(Site).filter(Site.id == payload.site_id).first()
        if not site:
            raise HTTPException(status_code=404, detail="об'єкт не знайдено")
    if payload.meter_id is not None:
        meter = db.query(Meter).filter(Meter.id == payload.meter_id).first()
        if not meter:
            raise HTTPException(status_code=404, detail="лічильник не знайдено")
    if site and meter and meter.site_id != site.id:
        raise HTTPException(status_code=400, detail="лічильник належить іншому об'єкту, ніж обраний у правилі")


@router.post("/rules")
def create_rule(payload: AlertRuleIn, db: Session = Depends(get_db)):
    _validate_rule_targets(payload, db)
    rule = AlertRule(**payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id}


@router.get("/rules", response_model=list[AlertRuleOut])
def list_rules(db: Session = Depends(get_db)):
    return db.query(AlertRule).order_by(AlertRule.id.desc()).all()


@router.put("/rules/{rule_id}", response_model=AlertRuleOut)
def update_rule(rule_id: int, payload: AlertRuleIn, db: Session = Depends(get_db)):
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="правило не знайдено")
    _validate_rule_targets(payload, db)
    rule.site_id = payload.site_id
    rule.meter_id = payload.meter_id
    rule.rule_type = payload.rule_type
    rule.threshold_kwh = payload.threshold_kwh
    rule.severity = payload.severity
    rule.enabled = payload.enabled
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="правило не знайдено")
    db.delete(rule)
    db.commit()
    return {"deleted": True}


@router.post("/run")
def run_alerts(db: Session = Depends(get_db)):
    rules = db.query(AlertRule).filter(AlertRule.enabled.is_(True)).all()
    created = 0
    for rule in rules:
        q = db.query(DailyAggregation)
        if rule.site_id:
            q = q.filter(DailyAggregation.site_id == rule.site_id)
        if rule.meter_id:
            q = q.filter(DailyAggregation.meter_id == rule.meter_id)
        total = q.with_entities(func.coalesce(func.sum(DailyAggregation.total_kwh), 0)).scalar() or 0
        if float(total) > rule.threshold_kwh:
            alert = Alert(
                meter_id=rule.meter_id,
                site_id=rule.site_id,
                alert_type=rule.rule_type,
                severity=rule.severity,
                message=f"Споживання {total:.2f} кВт·год перевищило поріг {rule.threshold_kwh:.2f} кВт·год",
                created_at=datetime.utcnow(),
            )
            db.add(alert)
            created += 1
            ALERTS_GENERATED_TOTAL.inc()
    db.commit()
    return {"alerts_created": created}


@router.get("")
def get_alerts(active_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(Alert).order_by(Alert.created_at.desc())
    if active_only:
        q = q.filter(Alert.resolved_at.is_(None))
    rows = q.limit(200).all()
    return [
        {
            "id": r.id,
            "site_id": r.site_id,
            "meter_id": r.meter_id,
            "type": r.alert_type,
            "severity": r.severity,
            "message": r.message,
            "created_at": r.created_at,
            "resolved_at": r.resolved_at,
        }
        for r in rows
    ]
