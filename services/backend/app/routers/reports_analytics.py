"""Аналітичні звіти: навантаження по лінії, порівняння об'єктів, топи, зведення сповіщень."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.metrics import REPORT_REQUESTS_TOTAL
from app.models import (
    Alert,
    DailyAggregation,
    ElectricalLine,
    Enterprise,
    Meter,
    MonthlyAggregation,
    Site,
    Substation,
    Transformer,
    ValidatedReading,
)

router = APIRouter(prefix="/reports", tags=["reports-analytics"])


def _meter_status_ua(status: Any) -> str:
    v = getattr(status, "value", status)
    v = str(v).lower()
    if v == "active":
        return "Активний"
    if v == "inactive":
        return "Неактивний"
    if v == "maintenance":
        return "На обслуговуванні"
    return str(status)


def _alert_severity_ua(sev: str) -> str:
    m = {
        "low": "Низька",
        "medium": "Середня",
        "high": "Висока",
        "critical": "Критична",
        "warning": "Попередження",
    }
    return m.get(str(sev).lower(), sev)


def _alert_node_label(a: Alert) -> str:
    if a.meter_id:
        return "лічильник"
    if a.site_id:
        return "об'єкт"
    if a.line_id:
        return "лінія"
    if a.transformer_id:
        return "трансформатор"
    if a.substation_id:
        return "підстанція"
    return "система"


def _resolve_line(
    db: Session,
    line_id: int,
    enterprise_id: int | None,
    substation_id: int | None,
    transformer_id: int | None,
) -> tuple[ElectricalLine, Transformer, Substation, Enterprise]:
    row = (
        db.query(ElectricalLine, Transformer, Substation, Enterprise)
        .join(Transformer, Transformer.id == ElectricalLine.transformer_id)
        .join(Substation, Substation.id == Transformer.substation_id)
        .join(Enterprise, Enterprise.id == Substation.enterprise_id)
        .filter(ElectricalLine.id == line_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="лінія не знайдена")
    line, tr, sub, ent = row
    if enterprise_id is not None and int(ent.id) != int(enterprise_id):
        raise HTTPException(status_code=400, detail="лінія не належить обраному підприємству")
    if substation_id is not None and int(sub.id) != int(substation_id):
        raise HTTPException(status_code=400, detail="лінія не належить обраній підстанції")
    if transformer_id is not None and int(tr.id) != int(transformer_id):
        raise HTTPException(status_code=400, detail="лінія не належить обраному трансформатору")
    return line, tr, sub, ent


def _meter_ids_on_line(db: Session, line_id: int, site_id: int | None = None) -> list[int]:
    q = db.query(Meter.id).filter(Meter.line_id == line_id)
    if site_id is not None:
        q = q.filter(Meter.site_id == site_id)
    return [int(r[0]) for r in q.all()]


def _site_ids_on_line(db: Session, line_id: int) -> list[int]:
    rows = db.query(Meter.site_id).filter(Meter.line_id == line_id).distinct().all()
    return [int(r[0]) for r in rows]


def _period_days(date_from: datetime, date_to: datetime) -> int:
    delta = date_to - date_from
    return max(int(delta.total_seconds() // 86400) + 1, 1)


@router.get("/line-load")
def line_load_report(
    line_id: int = Query(..., description="ID лінії"),
    date_from: datetime = Query(..., description="Початок періоду"),
    date_to: datetime = Query(..., description="Кінець періоду (включно з днем)"),
    granularity: str = Query("daily", description="hourly | daily | monthly"),
    enterprise_id: int | None = Query(default=None),
    substation_id: int | None = Query(default=None),
    transformer_id: int | None = Query(default=None),
    site_id: int | None = Query(default=None, description="Обмежити лічильники об'єктом"),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("line_load").inc()
    gran = granularity.strip().lower()
    if gran not in {"hourly", "daily", "monthly"}:
        raise HTTPException(status_code=400, detail="granularity має бути hourly, daily або monthly")

    line, tr, sub, ent = _resolve_line(db, line_id, enterprise_id, substation_id, transformer_id)
    meter_ids = _meter_ids_on_line(db, line_id, site_id)
    if not meter_ids:
        raise HTTPException(status_code=400, detail="на лінії немає лічильників для звіту")

    period_start = date_from
    period_end = date_to
    if period_end < period_start:
        raise HTTPException(status_code=400, detail="date_to має бути не раніше за date_from")

    days = _period_days(period_start, period_end)
    prev_end = period_start - timedelta(seconds=1)
    prev_start = prev_end - timedelta(days=days)

    def line_total_kwh(start: datetime, end: datetime) -> float:
        q = (
            db.query(func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0))
            .select_from(DailyAggregation)
            .join(Meter, Meter.id == DailyAggregation.meter_id)
            .filter(Meter.line_id == line_id, DailyAggregation.day >= start, DailyAggregation.day <= end)
        )
        if site_id is not None:
            q = q.filter(Meter.site_id == site_id)
        return float(q.scalar() or 0.0)

    current_total = line_total_kwh(period_start, period_end)
    previous_total = line_total_kwh(prev_start, prev_end)
    trend_pct = ((current_total - previous_total) / previous_total * 100.0) if previous_total > 0 else None

    # Активні об'єкти / лічильники (були покази > 0)
    active_sites = (
        db.query(func.count(func.distinct(DailyAggregation.site_id)))
        .select_from(DailyAggregation)
        .join(Meter, Meter.id == DailyAggregation.meter_id)
        .filter(
            Meter.line_id == line_id,
            DailyAggregation.day >= period_start,
            DailyAggregation.day <= period_end,
            DailyAggregation.total_kwh > 0,
        )
    )
    if site_id is not None:
        active_sites = active_sites.filter(Meter.site_id == site_id)
    active_sites_n = int(active_sites.scalar() or 0)

    active_meters = (
        db.query(func.count(func.distinct(DailyAggregation.meter_id)))
        .select_from(DailyAggregation)
        .join(Meter, Meter.id == DailyAggregation.meter_id)
        .filter(
            Meter.line_id == line_id,
            DailyAggregation.day >= period_start,
            DailyAggregation.day <= period_end,
            DailyAggregation.total_kwh > 0,
        )
    )
    if site_id is not None:
        active_meters = active_meters.filter(Meter.site_id == site_id)
    active_meters_n = int(active_meters.scalar() or 0)

    # Часовий ряд
    time_series: list[dict[str, Any]] = []
    if gran == "hourly":
        q = (
            db.query(
                func.date_trunc("hour", ValidatedReading.ts).label("bucket"),
                func.coalesce(func.sum(ValidatedReading.value_kwh), 0.0).label("total_kwh"),
            )
            .select_from(ValidatedReading)
            .join(Meter, Meter.id == ValidatedReading.meter_id)
            .filter(
                Meter.line_id == line_id,
                ValidatedReading.ts >= period_start,
                ValidatedReading.ts <= period_end + timedelta(days=1),
            )
        )
        if site_id is not None:
            q = q.filter(Meter.site_id == site_id)
        rows = q.group_by(func.date_trunc("hour", ValidatedReading.ts)).order_by(func.date_trunc("hour", ValidatedReading.ts)).all()
        time_series = [{"bucket": r.bucket, "total_kwh": float(r.total_kwh)} for r in rows]
    elif gran == "daily":
        q = (
            db.query(
                func.date_trunc("day", DailyAggregation.day).label("bucket"),
                func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0).label("total_kwh"),
            )
            .select_from(DailyAggregation)
            .join(Meter, Meter.id == DailyAggregation.meter_id)
            .filter(
                Meter.line_id == line_id,
                DailyAggregation.day >= period_start,
                DailyAggregation.day <= period_end,
            )
        )
        if site_id is not None:
            q = q.filter(Meter.site_id == site_id)
        rows = q.group_by(func.date_trunc("day", DailyAggregation.day)).order_by(func.date_trunc("day", DailyAggregation.day)).all()
        time_series = [{"bucket": r.bucket, "total_kwh": float(r.total_kwh)} for r in rows]
    else:
        q = (
            db.query(
                func.date_trunc("month", MonthlyAggregation.month).label("bucket"),
                func.coalesce(func.sum(MonthlyAggregation.total_kwh), 0.0).label("total_kwh"),
            )
            .select_from(MonthlyAggregation)
            .join(Meter, Meter.id == MonthlyAggregation.meter_id)
            .filter(
                Meter.line_id == line_id,
                MonthlyAggregation.month >= period_start,
                MonthlyAggregation.month <= period_end,
            )
        )
        if site_id is not None:
            q = q.filter(Meter.site_id == site_id)
        rows = q.group_by(func.date_trunc("month", MonthlyAggregation.month)).order_by(
            func.date_trunc("month", MonthlyAggregation.month)
        ).all()
        time_series = [{"bucket": r.bucket, "total_kwh": float(r.total_kwh)} for r in rows]

    peak_kwh = max((p["total_kwh"] for p in time_series), default=0.0)
    peak_bucket = None
    if time_series:
        peak_bucket = max(time_series, key=lambda x: x["total_kwh"])["bucket"]

    site_ids = _site_ids_on_line(db, line_id)
    if site_id is not None:
        site_ids = [sid for sid in site_ids if int(sid) == int(site_id)]

    if not site_ids:
        site_rows = []
    else:
        site_rows = (
            db.query(
                Site.id,
                Site.name,
                func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0).label("total_kwh"),
            )
            .join(Meter, Meter.site_id == Site.id)
            .join(DailyAggregation, DailyAggregation.meter_id == Meter.id)
            .filter(
                Meter.line_id == line_id,
                Site.id.in_(site_ids),
                DailyAggregation.day >= period_start,
                DailyAggregation.day <= period_end,
            )
            .group_by(Site.id, Site.name)
            .order_by(func.sum(DailyAggregation.total_kwh).desc())
            .all()
        )
    line_total_for_share = float(sum(float(r.total_kwh) for r in site_rows) or current_total or 1.0)
    sites_distribution = [
        {
            "site_id": int(r.id),
            "name": r.name,
            "total_kwh": float(r.total_kwh),
            "share_percent": float(r.total_kwh) / line_total_for_share * 100.0 if line_total_for_share else 0.0,
        }
        for r in site_rows
    ]

    meters_q = (
        db.query(
            Meter.id,
            Meter.serial_number,
            Meter.zone_name,
            Meter.meter_role,
            Meter.status,
            Meter.last_seen_at,
            Meter.site_id,
            Site.name.label("site_name"),
            func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0).label("consumption_kwh"),
        )
        .join(Site, Site.id == Meter.site_id)
        .outerjoin(
            DailyAggregation,
            (DailyAggregation.meter_id == Meter.id)
            & (DailyAggregation.day >= period_start)
            & (DailyAggregation.day <= period_end),
        )
        .filter(Meter.line_id == line_id)
        .group_by(
            Meter.id,
            Meter.serial_number,
            Meter.zone_name,
            Meter.meter_role,
            Meter.status,
            Meter.last_seen_at,
            Meter.site_id,
            Site.name,
        )
    )
    if site_id is not None:
        meters_q = meters_q.filter(Meter.site_id == site_id)
    meter_rows = meters_q.all()
    meters_by_site: dict[str, list[dict[str, Any]]] = {}
    for r in meter_rows:
        share = (float(r.consumption_kwh) / line_total_for_share * 100.0) if line_total_for_share else 0.0
        item = {
            "meter_id": int(r.id),
            "serial_number": r.serial_number,
            "zone_name": r.zone_name,
            "meter_role": r.meter_role,
            "consumption_kwh": float(r.consumption_kwh),
            "share_percent": share,
            "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
            "status": _meter_status_ua(r.status),
            "status_code": getattr(r.status, "value", str(r.status)),
            "site_id": int(r.site_id),
            "site_name": r.site_name,
        }
        key = str(r.site_id)
        meters_by_site.setdefault(key, []).append(item)

    hierarchy_table: list[dict[str, Any]] = [
        {
            "level": "line",
            "id": line.id,
            "name": line.name,
            "code": line.code,
            "total_kwh": current_total,
            "parent_id": None,
        }
    ]
    for s in sites_distribution:
        hierarchy_table.append(
            {
                "level": "site",
                "id": s["site_id"],
                "name": s["name"],
                "total_kwh": s["total_kwh"],
                "share_percent_line": s["share_percent"],
                "parent_id": line.id,
            }
        )
    for r in meter_rows:
        hierarchy_table.append(
            {
                "level": "meter",
                "id": int(r.id),
                "name": r.serial_number,
                "site_id": int(r.site_id),
                "zone_name": r.zone_name,
                "meter_role": r.meter_role,
                "total_kwh": float(r.consumption_kwh),
                "share_percent_line": (float(r.consumption_kwh) / line_total_for_share * 100.0)
                if line_total_for_share
                else 0.0,
                "status": _meter_status_ua(r.status),
                "parent_id": int(r.site_id),
            }
        )

    site_ids_line = _site_ids_on_line(db, line_id)
    alert_parts = [Alert.line_id == line_id, Alert.meter_id.in_(meter_ids)]
    if site_ids_line:
        alert_parts.append(Alert.site_id.in_(site_ids_line))
    alerts_q = db.query(Alert).filter(
        Alert.created_at >= period_start,
        Alert.created_at <= period_end + timedelta(days=1),
        or_(*alert_parts),
    )
    alerts_list = alerts_q.order_by(Alert.created_at.desc()).limit(200).all()
    alerts_out = [
        {
            "id": a.id,
            "severity": _alert_severity_ua(a.severity),
            "severity_code": a.severity,
            "node": _alert_node_label(a),
            "created_at": a.created_at.isoformat(),
            "message": a.message,
            "line_id": a.line_id,
            "site_id": a.site_id,
            "meter_id": a.meter_id,
        }
        for a in alerts_list
    ]
    alerts_by_sev: dict[str, int] = {}
    for a in alerts_list:
        alerts_by_sev[a.severity] = alerts_by_sev.get(a.severity, 0) + 1

    top_sites = sorted(sites_distribution, key=lambda x: x["total_kwh"], reverse=True)[:10]
    top_meters_flat = sorted(
        [m for group in meters_by_site.values() for m in group],
        key=lambda x: x["consumption_kwh"],
        reverse=True,
    )[:10]

    tr_name = (tr.name or "").strip() or tr.code or f"Трансформатор #{tr.id}"

    return {
        "context": {
            "enterprise": {"id": ent.id, "name": ent.name},
            "substation": {"id": sub.id, "name": sub.name, "code": sub.code},
            "transformer": {"id": tr.id, "name": tr_name, "code": tr.code},
            "line": {"id": line.id, "name": line.name, "code": line.code},
            "period": {"date_from": period_start, "date_to": period_end},
            "granularity": gran,
            "site_filter_id": site_id,
        },
        "kpi": {
            "total_kwh_line": current_total,
            "avg_daily_kwh": current_total / max(days, 1),
            "peak_kwh": float(peak_kwh),
            "peak_bucket": peak_bucket.isoformat() if peak_bucket else None,
            "active_sites": active_sites_n,
            "active_meters": active_meters_n,
            "alerts_count": len(alerts_list),
            "trend_pct_vs_previous_period": trend_pct,
            "previous_period_total_kwh": previous_total,
        },
        "time_series": time_series,
        "sites_distribution": sites_distribution,
        "meters_by_site": meters_by_site,
        "hierarchy_table": hierarchy_table,
        "top_sites": top_sites,
        "top_meters": top_meters_flat,
        "alerts": alerts_out,
        "alerts_summary_by_severity": alerts_by_sev,
    }


@router.get("/site-compare")
def site_compare_report(
    line_id: int = Query(...),
    site_a: int = Query(...),
    site_b: int = Query(...),
    date_from: datetime = Query(...),
    date_to: datetime = Query(...),
    enterprise_id: int | None = Query(default=None),
    substation_id: int | None = Query(default=None),
    transformer_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("site_compare").inc()
    _resolve_line(db, line_id, enterprise_id, substation_id, transformer_id)

    def site_daily(site_id: int) -> list[dict[str, Any]]:
        rows = (
            db.query(
                func.date_trunc("day", DailyAggregation.day).label("day"),
                func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0).label("total_kwh"),
            )
            .select_from(DailyAggregation)
            .join(Meter, Meter.id == DailyAggregation.meter_id)
            .filter(
                Meter.line_id == line_id,
                Meter.site_id == site_id,
                DailyAggregation.day >= date_from,
                DailyAggregation.day <= date_to,
            )
            .group_by(func.date_trunc("day", DailyAggregation.day))
            .order_by(func.date_trunc("day", DailyAggregation.day))
            .all()
        )
        return [{"day": r.day, "total_kwh": float(r.total_kwh)} for r in rows]

    def site_total(site_id: int) -> float:
        q = (
            db.query(func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0))
            .select_from(DailyAggregation)
            .join(Meter, Meter.id == DailyAggregation.meter_id)
            .filter(
                Meter.line_id == line_id,
                Meter.site_id == site_id,
                DailyAggregation.day >= date_from,
                DailyAggregation.day <= date_to,
            )
        )
        return float(q.scalar() or 0.0)

    for sid in (site_a, site_b):
        m = db.query(Meter).filter(Meter.site_id == sid, Meter.line_id == line_id).first()
        if not m:
            raise HTTPException(status_code=400, detail=f"об'єкт {sid} не має лічильників на цій лінії")

    sa = db.query(Site).filter(Site.id == site_a).first()
    sb = db.query(Site).filter(Site.id == site_b).first()
    ta = site_total(site_a)
    tb = site_total(site_b)
    diff = ta - tb
    diff_pct = (diff / tb * 100.0) if tb > 0 else None

    return {
        "line_id": line_id,
        "period": {"date_from": date_from, "date_to": date_to},
        "site_a": {"id": site_a, "name": sa.name if sa else "", "total_kwh": ta, "daily": site_daily(site_a)},
        "site_b": {"id": site_b, "name": sb.name if sb else "", "total_kwh": tb, "daily": site_daily(site_b)},
        "difference_kwh": diff,
        "difference_pct_vs_site_b": diff_pct,
    }


@router.get("/top-sites")
def top_sites_report(
    line_id: int = Query(...),
    date_from: datetime = Query(...),
    date_to: datetime = Query(...),
    limit: int = Query(10, ge=1, le=50),
    enterprise_id: int | None = Query(default=None),
    substation_id: int | None = Query(default=None),
    transformer_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("top_sites").inc()
    _resolve_line(db, line_id, enterprise_id, substation_id, transformer_id)
    rows = (
        db.query(
            Site.id,
            Site.name,
            func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0).label("total_kwh"),
        )
        .join(Meter, Meter.site_id == Site.id)
        .join(DailyAggregation, DailyAggregation.meter_id == Meter.id)
        .filter(
            Meter.line_id == line_id,
            DailyAggregation.day >= date_from,
            DailyAggregation.day <= date_to,
        )
        .group_by(Site.id, Site.name)
        .order_by(func.sum(DailyAggregation.total_kwh).desc())
        .limit(limit)
        .all()
    )
    return [{"site_id": int(r.id), "name": r.name, "total_kwh": float(r.total_kwh)} for r in rows]


@router.get("/top-meters")
def top_meters_report(
    line_id: int = Query(...),
    date_from: datetime = Query(...),
    date_to: datetime = Query(...),
    limit: int = Query(10, ge=1, le=50),
    site_id: int | None = Query(default=None),
    enterprise_id: int | None = Query(default=None),
    substation_id: int | None = Query(default=None),
    transformer_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("top_meters").inc()
    _resolve_line(db, line_id, enterprise_id, substation_id, transformer_id)
    q = (
        db.query(
            Meter.id,
            Meter.serial_number,
            Meter.zone_name,
            Site.name.label("site_name"),
            func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0).label("total_kwh"),
        )
        .join(Site, Site.id == Meter.site_id)
        .join(DailyAggregation, DailyAggregation.meter_id == Meter.id)
        .filter(
            Meter.line_id == line_id,
            DailyAggregation.day >= date_from,
            DailyAggregation.day <= date_to,
        )
    )
    if site_id is not None:
        q = q.filter(Meter.site_id == site_id)
    rows = q.group_by(Meter.id, Meter.serial_number, Meter.zone_name, Site.name).order_by(func.sum(DailyAggregation.total_kwh).desc()).limit(limit).all()
    return [
        {
            "meter_id": int(r.id),
            "serial_number": r.serial_number,
            "zone_name": r.zone_name,
            "site_name": r.site_name,
            "total_kwh": float(r.total_kwh),
        }
        for r in rows
    ]


@router.get("/alerts-summary")
def alerts_summary_report(
    line_id: int = Query(...),
    date_from: datetime = Query(...),
    date_to: datetime = Query(...),
    enterprise_id: int | None = Query(default=None),
    substation_id: int | None = Query(default=None),
    transformer_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("alerts_summary").inc()
    _resolve_line(db, line_id, enterprise_id, substation_id, transformer_id)
    meter_ids = _meter_ids_on_line(db, line_id)
    site_ids_line = _site_ids_on_line(db, line_id)
    alert_parts = [Alert.line_id == line_id, Alert.meter_id.in_(meter_ids)]
    if site_ids_line:
        alert_parts.append(Alert.site_id.in_(site_ids_line))
    alerts_q = db.query(Alert).filter(
        Alert.created_at >= date_from,
        Alert.created_at <= date_to + timedelta(days=1),
        or_(*alert_parts),
    )
    alerts_list = alerts_q.order_by(Alert.created_at.desc()).all()
    by_sev: dict[str, int] = {}
    for a in alerts_list:
        by_sev[a.severity] = by_sev.get(a.severity, 0) + 1
    return {
        "line_id": line_id,
        "period": {"date_from": date_from, "date_to": date_to},
        "total": len(alerts_list),
        "by_severity_code": by_sev,
        "by_severity_ua": {_alert_severity_ua(k): v for k, v in by_sev.items()},
        "items": [
            {
                "id": a.id,
                "severity_ua": _alert_severity_ua(a.severity),
                "severity_code": a.severity,
                "node_ua": _alert_node_label(a),
                "created_at": a.created_at.isoformat(),
                "message": a.message,
            }
            for a in alerts_list[:100]
        ],
    }


@router.get("/line-load/export.csv")
def line_load_export_csv(
    line_id: int = Query(...),
    date_from: datetime = Query(...),
    date_to: datetime = Query(...),
    granularity: str = Query("daily"),
    enterprise_id: int | None = Query(default=None),
    substation_id: int | None = Query(default=None),
    transformer_id: int | None = Query(default=None),
    site_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Експорт основних рядків ієрархії та лічильників у CSV."""
    REPORT_REQUESTS_TOTAL.labels("line_export_csv").inc()
    payload = line_load_report(
        line_id=line_id,
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
        enterprise_id=enterprise_id,
        substation_id=substation_id,
        transformer_id=transformer_id,
        site_id=site_id,
        db=db,
    )
    lines = ["level;id;name;total_kwh;site_id;zone;role;status"]
    for row in payload["hierarchy_table"]:
        if row["level"] == "meter":
            lines.append(
                f"meter;{row['id']};{row['name']};{row['total_kwh']:.4f};{row.get('site_id', '')};"
                f"{row.get('zone_name', '')};{row.get('meter_role', '')};{row.get('status', '')}"
            )
        elif row["level"] == "site":
            lines.append(f"site;{row['id']};{row['name']};{row['total_kwh']:.4f};;;;")
        else:
            lines.append(f"line;{row['id']};{row['name']};{row['total_kwh']:.4f};;;;")
    body = "\n".join(lines) + "\n"
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="line_{line_id}_report.csv"'},
    )
