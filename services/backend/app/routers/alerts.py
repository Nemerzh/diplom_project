from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, aliased

from app.db import get_db
from app.metrics import ALERTS_GENERATED_TOTAL
from app.models import Alert, AlertRule, DailyAggregation, ElectricalLine, Enterprise, Meter, Site, Substation, Transformer
from app.schemas import AlertRuleIn, AlertRuleOut

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _severity_ua(code: str) -> str:
    m = {
        "low": "Низька",
        "medium": "Середня",
        "high": "Висока",
        "critical": "Критична",
        "warning": "Попередження",
    }
    return m.get(str(code or "").lower(), str(code or "—"))


def _alert_type_ua(t: str) -> str:
    m = {"threshold": "Поріг споживання", "offline": "Немає зв'язку"}
    return m.get(str(t or "").lower(), str(t or "—"))


def _node_ua(a: Alert) -> str:
    if a.meter_id:
        return "Лічильник"
    if a.site_id:
        return "Об'єкт"
    if a.line_id:
        return "Лінія"
    if a.transformer_id:
        return "Трансформатор"
    if a.substation_id:
        return "Підстанція"
    return "Система"


def _serialize_alert_row(r) -> dict:
    """Рядок результату запиту: Alert + підписи вузлів."""
    a = r[0]
    site_name = r[1]
    meter_serial = r[2]
    line_name = r[3]
    enterprise_name = r[4]
    substation_name = r[5]
    return {
        "id": a.id,
        "alert_type": a.alert_type,
        "alert_type_ua": _alert_type_ua(a.alert_type),
        "severity": a.severity,
        "severity_ua": _severity_ua(a.severity),
        "message": a.message,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
        "is_active": a.resolved_at is None,
        "node_ua": _node_ua(a),
        "site_id": a.site_id,
        "site_name": site_name,
        "meter_id": a.meter_id,
        "meter_serial": meter_serial,
        "line_id": a.line_id,
        "line_name": line_name,
        "substation_id": a.substation_id,
        "substation_name": substation_name,
        "transformer_id": a.transformer_id,
        "enterprise_name": enterprise_name,
    }


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
    since = datetime.utcnow() - timedelta(days=30)
    for rule in rules:
        q = db.query(DailyAggregation).filter(DailyAggregation.day >= since)
        if rule.site_id:
            q = q.filter(DailyAggregation.site_id == rule.site_id)
        if rule.meter_id:
            q = q.filter(DailyAggregation.meter_id == rule.meter_id)
        total = q.with_entities(func.coalesce(func.sum(DailyAggregation.total_kwh), 0)).scalar() or 0
        if float(total) > rule.threshold_kwh:
            line_id = None
            site_id = rule.site_id
            substation_id = None
            transformer_id = None
            if rule.meter_id:
                meter = db.query(Meter).filter(Meter.id == rule.meter_id).first()
                if meter:
                    site_id = meter.site_id
                    line_id = meter.line_id
                    if line_id:
                        line = db.query(ElectricalLine).filter(ElectricalLine.id == line_id).first()
                        if line:
                            transformer_id = line.transformer_id
                            tr = db.query(Transformer).filter(Transformer.id == transformer_id).first()
                            if tr:
                                substation_id = tr.substation_id
            alert = Alert(
                meter_id=rule.meter_id,
                site_id=site_id,
                line_id=line_id,
                substation_id=substation_id,
                transformer_id=transformer_id,
                alert_type=rule.rule_type,
                severity=rule.severity,
                message=f"За останні 30 днів споживання {total:.2f} кВт·год перевищило поріг {rule.threshold_kwh:.2f} кВт·год",
                created_at=datetime.utcnow(),
            )
            db.add(alert)
            created += 1
            ALERTS_GENERATED_TOTAL.inc()
    db.commit()
    return {"alerts_created": created}


@router.get("")
def get_alerts(
    active_only: bool = Query(default=True),
    severity: str | None = Query(default=None, description="low|medium|high|critical|warning"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    enterprise_id: int | None = Query(default=None),
    site_id: int | None = Query(default=None),
    meter_id: int | None = Query(default=None),
    line_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    SiteFromMeter = aliased(Site)
    EntFromSite = aliased(Enterprise)
    EntFromMeterSite = aliased(Enterprise)
    MeterForAlert = aliased(Meter)
    q = (
        db.query(
            Alert,
            func.coalesce(Site.name, SiteFromMeter.name).label("site_name"),
            MeterForAlert.serial_number.label("meter_serial"),
            ElectricalLine.name.label("line_name"),
            func.coalesce(EntFromSite.name, EntFromMeterSite.name).label("enterprise_name"),
            Substation.name.label("substation_name"),
        )
        .outerjoin(Site, Site.id == Alert.site_id)
        .outerjoin(EntFromSite, EntFromSite.id == Site.enterprise_id)
        .outerjoin(MeterForAlert, MeterForAlert.id == Alert.meter_id)
        .outerjoin(SiteFromMeter, SiteFromMeter.id == MeterForAlert.site_id)
        .outerjoin(EntFromMeterSite, EntFromMeterSite.id == SiteFromMeter.enterprise_id)
        .outerjoin(ElectricalLine, ElectricalLine.id == Alert.line_id)
        .outerjoin(Substation, Substation.id == Alert.substation_id)
    )
    if active_only:
        q = q.filter(Alert.resolved_at.is_(None))
    if severity:
        q = q.filter(Alert.severity == severity)
    if date_from:
        q = q.filter(Alert.created_at >= date_from)
    if date_to:
        q = q.filter(Alert.created_at <= date_to)
    if enterprise_id is not None:
        q = q.filter(or_(EntFromSite.id == enterprise_id, EntFromMeterSite.id == enterprise_id))
    if site_id is not None:
        q = q.filter(Alert.site_id == site_id)
    if meter_id is not None:
        q = q.filter(Alert.meter_id == meter_id)
    if line_id is not None:
        q = q.filter(Alert.line_id == line_id)
    rows = q.order_by(Alert.created_at.desc()).limit(limit).all()
    return [_serialize_alert_row(r) for r in rows]


@router.get("/summary")
def alerts_summary(
    active_only: bool = Query(default=True),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    enterprise_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    SiteFromMeter = aliased(Site)
    EntFromSite = aliased(Enterprise)
    EntFromMeterSite = aliased(Enterprise)
    MeterForAlert = aliased(Meter)
    q = (
        db.query(Alert.severity, func.count(Alert.id))
        .select_from(Alert)
        .outerjoin(Site, Site.id == Alert.site_id)
        .outerjoin(EntFromSite, EntFromSite.id == Site.enterprise_id)
        .outerjoin(MeterForAlert, MeterForAlert.id == Alert.meter_id)
        .outerjoin(SiteFromMeter, SiteFromMeter.id == MeterForAlert.site_id)
        .outerjoin(EntFromMeterSite, EntFromMeterSite.id == SiteFromMeter.enterprise_id)
    )
    if active_only:
        q = q.filter(Alert.resolved_at.is_(None))
    if date_from:
        q = q.filter(Alert.created_at >= date_from)
    if date_to:
        q = q.filter(Alert.created_at <= date_to)
    if enterprise_id is not None:
        q = q.filter(or_(EntFromSite.id == enterprise_id, EntFromMeterSite.id == enterprise_id))
    rows = q.group_by(Alert.severity).all()
    by_sev = {r[0]: int(r[1]) for r in rows}
    total_active = sum(by_sev.values()) if active_only else None
    return {
        "by_severity": by_sev,
        "by_severity_ua": {_severity_ua(k): v for k, v in by_sev.items()},
        "total": sum(by_sev.values()),
        "total_active": total_active,
    }


@router.post("/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="сповіщення не знайдено")
    if alert.resolved_at is not None:
        return {"ok": True, "already_resolved": True}
    alert.resolved_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "resolved_at": alert.resolved_at.isoformat()}
