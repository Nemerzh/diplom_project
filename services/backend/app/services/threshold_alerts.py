"""Оцінка порогових правил за сумою кВт·год у validated_readings за sliding window."""

from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.metrics import ALERTS_GENERATED_TOTAL
from app.models import Alert, AlertRule, ElectricalLine, Meter, Transformer, ValidatedReading
from app.utils.timeutils import now_utc


def evaluate_threshold_rules(db: Session) -> int:
    rules = db.query(AlertRule).filter(AlertRule.enabled.is_(True)).all()
    created = 0
    for rule in rules:
        if rule.rule_type != "threshold":
            continue
        days = max(1, min(366, int(rule.window_days or 30)))
        since = now_utc() - timedelta(days=days)
        q = (
            db.query(func.coalesce(func.sum(ValidatedReading.value_kwh), 0.0))
            .select_from(ValidatedReading)
            .filter(ValidatedReading.ts >= since)
        )
        if rule.site_id:
            q = q.join(Meter, Meter.id == ValidatedReading.meter_id).filter(Meter.site_id == rule.site_id)
        if rule.meter_id:
            q = q.filter(ValidatedReading.meter_id == rule.meter_id)
        total = float(q.scalar() or 0)
        if total <= rule.threshold_kwh:
            continue
        existing = (
            db.query(Alert)
            .filter(Alert.alert_rule_id == rule.id, Alert.resolved_at.is_(None))
            .first()
        )
        if existing:
            continue
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
            alert_rule_id=rule.id,
            meter_id=rule.meter_id,
            site_id=site_id,
            line_id=line_id,
            substation_id=substation_id,
            transformer_id=transformer_id,
            alert_type=rule.rule_type,
            severity=rule.severity,
            message=(
                f"За останні {days} днів споживання {total:.2f} кВт·год перевищило поріг "
                f"{rule.threshold_kwh:.2f} кВт·год"
            ),
            created_at=now_utc(),
        )
        db.add(alert)
        created += 1
        ALERTS_GENERATED_TOTAL.inc()
    db.commit()
    return created
