from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.metrics import REPORT_REQUESTS_TOTAL
from app.models import (
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

router = APIRouter(prefix="/reports", tags=["aggregation"])


@router.post("/rebuild")
def rebuild_aggregations(db: Session = Depends(get_db)):
    db.query(DailyAggregation).delete()
    db.query(MonthlyAggregation).delete()
    db.commit()

    daily_rows = (
        db.query(
            ValidatedReading.meter_id,
            func.date_trunc("day", ValidatedReading.ts).label("bucket"),
            func.sum(ValidatedReading.value_kwh).label("total"),
        )
        .group_by(ValidatedReading.meter_id, func.date_trunc("day", ValidatedReading.ts))
        .all()
    )
    for row in daily_rows:
        meter = db.query(Meter).filter(Meter.id == row.meter_id).first()
        db.add(DailyAggregation(meter_id=row.meter_id, site_id=meter.site_id, day=row.bucket, total_kwh=row.total))

    monthly_rows = (
        db.query(
            ValidatedReading.meter_id,
            func.date_trunc("month", ValidatedReading.ts).label("bucket"),
            func.sum(ValidatedReading.value_kwh).label("total"),
        )
        .group_by(ValidatedReading.meter_id, func.date_trunc("month", ValidatedReading.ts))
        .all()
    )
    for row in monthly_rows:
        meter = db.query(Meter).filter(Meter.id == row.meter_id).first()
        db.add(
            MonthlyAggregation(meter_id=row.meter_id, site_id=meter.site_id, month=row.bucket, total_kwh=row.total)
        )

    db.commit()
    return {"daily": len(daily_rows), "monthly": len(monthly_rows)}


@router.get("/daily")
def daily_report(
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    enterprise_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("daily").inc()
    query = db.query(DailyAggregation).join(Site, Site.id == DailyAggregation.site_id)
    if enterprise_id is not None:
        query = query.filter(Site.enterprise_id == enterprise_id)
    if from_date:
        query = query.filter(DailyAggregation.day >= from_date)
    if to_date:
        query = query.filter(DailyAggregation.day <= to_date)
    rows = query.order_by(DailyAggregation.day.desc()).all()
    return [{"site_id": r.site_id, "meter_id": r.meter_id, "day": r.day, "total_kwh": r.total_kwh} for r in rows]


@router.get("/monthly")
def monthly_report(
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    enterprise_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("monthly").inc()
    query = db.query(MonthlyAggregation).join(Site, Site.id == MonthlyAggregation.site_id)
    if enterprise_id is not None:
        query = query.filter(Site.enterprise_id == enterprise_id)
    if from_date:
        query = query.filter(MonthlyAggregation.month >= from_date)
    if to_date:
        query = query.filter(MonthlyAggregation.month <= to_date)
    rows = query.order_by(MonthlyAggregation.month.desc()).all()
    return [{"site_id": r.site_id, "meter_id": r.meter_id, "month": r.month, "total_kwh": r.total_kwh} for r in rows]


@router.get("/compare")
def compare_sites(
    siteA: int,
    siteB: int,
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    enterprise_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("compare").inc()
    if enterprise_id is not None:
        for sid in (siteA, siteB):
            site = db.query(Site).filter(Site.id == sid).first()
            if not site or site.enterprise_id != enterprise_id:
                raise HTTPException(status_code=400, detail="об'єкт не належить обраному підприємству")

    def site_total(site_id: int) -> float:
        q = db.query(func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0)).filter(DailyAggregation.site_id == site_id)
        if from_date:
            q = q.filter(DailyAggregation.day >= from_date)
        if to_date:
            q = q.filter(DailyAggregation.day <= to_date)
        total = q.scalar()
        return float(total or 0.0)

    a = db.query(Site).filter(Site.id == siteA).first()
    b = db.query(Site).filter(Site.id == siteB).first()
    total_a = site_total(siteA)
    total_b = site_total(siteB)
    diff_kwh = total_a - total_b
    diff_pct = (diff_kwh / total_b * 100.0) if total_b > 0 else None
    return {
        "period": {"from_date": from_date, "to_date": to_date},
        "siteA": {"id": siteA, "name": a.name if a else "unknown", "total_kwh": total_a},
        "siteB": {"id": siteB, "name": b.name if b else "unknown", "total_kwh": total_b},
        "difference_kwh": diff_kwh,
        "difference_pct_vs_siteB": diff_pct,
    }


@router.get("/summary")
def summary_report(
    days: int = Query(default=30, ge=1, le=365),
    enterprise_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("summary").inc()
    now = datetime.utcnow()
    period_end = now
    period_start = now - timedelta(days=days)
    prev_start = period_start - timedelta(days=days)
    prev_end = period_start

    def _daily_scope():
        q = db.query(func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0)).select_from(DailyAggregation).join(
            Site, Site.id == DailyAggregation.site_id
        )
        if enterprise_id is not None:
            q = q.filter(Site.enterprise_id == enterprise_id)
        return q

    current_total = float(
        _daily_scope().filter(DailyAggregation.day >= period_start, DailyAggregation.day < period_end).scalar() or 0.0
    )
    previous_total = float(
        _daily_scope().filter(DailyAggregation.day >= prev_start, DailyAggregation.day < prev_end).scalar() or 0.0
    )

    trend_pct = None
    if previous_total > 0:
        trend_pct = ((current_total - previous_total) / previous_total) * 100.0

    daily_points_q = (
        db.query(
            func.date_trunc("day", DailyAggregation.day).label("day"),
            func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0).label("total_kwh"),
        )
        .select_from(DailyAggregation)
        .join(Site, Site.id == DailyAggregation.site_id)
        .filter(DailyAggregation.day >= period_start, DailyAggregation.day < period_end)
    )
    if enterprise_id is not None:
        daily_points_q = daily_points_q.filter(Site.enterprise_id == enterprise_id)
    daily_points = (
        daily_points_q.group_by(func.date_trunc("day", DailyAggregation.day))
        .order_by(func.date_trunc("day", DailyAggregation.day).asc())
        .all()
    )
    peak_day = max(daily_points, key=lambda row: float(row.total_kwh), default=None)

    top_sites_q = (
        db.query(
            DailyAggregation.site_id,
            Site.name,
            func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0).label("total_kwh"),
        )
        .join(Site, Site.id == DailyAggregation.site_id)
        .filter(DailyAggregation.day >= period_start, DailyAggregation.day < period_end)
    )
    if enterprise_id is not None:
        top_sites_q = top_sites_q.filter(Site.enterprise_id == enterprise_id)
    top_sites_rows = (
        top_sites_q.group_by(DailyAggregation.site_id, Site.name)
        .order_by(func.sum(DailyAggregation.total_kwh).desc())
        .limit(5)
        .all()
    )

    top_meters_q = (
        db.query(
            DailyAggregation.meter_id,
            Meter.serial_number,
            Meter.zone_name,
            func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0).label("total_kwh"),
        )
        .join(Meter, Meter.id == DailyAggregation.meter_id)
        .join(Site, Site.id == DailyAggregation.site_id)
        .filter(DailyAggregation.day >= period_start, DailyAggregation.day < period_end)
    )
    if enterprise_id is not None:
        top_meters_q = top_meters_q.filter(Site.enterprise_id == enterprise_id)
    top_meters_rows = (
        top_meters_q.group_by(DailyAggregation.meter_id, Meter.serial_number, Meter.zone_name)
        .order_by(func.sum(DailyAggregation.total_kwh).desc())
        .limit(5)
        .all()
    )

    active_sites_q = db.query(func.count(func.distinct(DailyAggregation.site_id))).select_from(DailyAggregation).join(
        Site, Site.id == DailyAggregation.site_id
    ).filter(DailyAggregation.day >= period_start, DailyAggregation.day < period_end)
    if enterprise_id is not None:
        active_sites_q = active_sites_q.filter(Site.enterprise_id == enterprise_id)
    active_sites = active_sites_q.scalar()

    active_meters_q = db.query(func.count(func.distinct(DailyAggregation.meter_id))).select_from(DailyAggregation).join(
        Site, Site.id == DailyAggregation.site_id
    ).filter(DailyAggregation.day >= period_start, DailyAggregation.day < period_end)
    if enterprise_id is not None:
        active_meters_q = active_meters_q.filter(Site.enterprise_id == enterprise_id)
    active_meters = active_meters_q.scalar()

    return {
        "period": {"days": days, "from_date": period_start, "to_date": period_end},
        "enterprise_id": enterprise_id,
        "kpi": {
            "total_kwh": current_total,
            "avg_daily_kwh": current_total / max(days, 1),
            "active_sites": int(active_sites or 0),
            "active_meters": int(active_meters or 0),
            "trend_pct_vs_prev_period": trend_pct,
        },
        "peak_day": {
            "day": peak_day.day if peak_day else None,
            "total_kwh": float(peak_day.total_kwh) if peak_day else 0.0,
        },
        "top_sites": [
            {"site_id": row.site_id, "name": row.name, "total_kwh": float(row.total_kwh)} for row in top_sites_rows
        ],
        "top_meters": [
            {
                "meter_id": row.meter_id,
                "serial_number": row.serial_number,
                "zone_name": row.zone_name,
                "total_kwh": float(row.total_kwh),
            }
            for row in top_meters_rows
        ],
    }


def _pick_period(from_date: datetime | None, to_date: datetime | None) -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    period_end = to_date or now
    if from_date:
        period_start = from_date
    else:
        period_start = period_end - timedelta(days=30)
    return period_start, period_end


def _to_float_map(rows: list[tuple[int, float]]) -> dict[int, float]:
    result: dict[int, float] = {}
    for meter_id, total in rows:
        result[int(meter_id)] = float(total or 0.0)
    return result


def _new_node(node_type: str, node_id: int | str, name: str) -> dict:
    return {
        "node_type": node_type,
        "id": node_id,
        "name": name,
        "total_kwh": 0.0,
        "previous_total_kwh": 0.0,
        "delta_kwh": 0.0,
        "delta_pct": None,
        "percent_of_parent": None,
        "children": [],
        "_index": {},
    }


def _get_or_add_child(parent: dict, node_type: str, node_id: int | str, name: str) -> dict:
    key = f"{node_type}:{node_id}"
    existing = parent["_index"].get(key)
    if existing is not None:
        return existing
    child = _new_node(node_type, node_id, name)
    parent["_index"][key] = child
    parent["children"].append(child)
    return child


def _finalize_node(node: dict) -> None:
    for child in node["children"]:
        _finalize_node(child)

    if node["children"]:
        node["total_kwh"] = float(sum(float(child["total_kwh"]) for child in node["children"]))
        node["previous_total_kwh"] = float(sum(float(child["previous_total_kwh"]) for child in node["children"]))

    node["delta_kwh"] = float(node["total_kwh"] - node["previous_total_kwh"])
    if node["previous_total_kwh"] > 0:
        node["delta_pct"] = float((node["delta_kwh"] / node["previous_total_kwh"]) * 100.0)
    else:
        node["delta_pct"] = None

    if node["total_kwh"] > 0:
        for child in node["children"]:
            child["percent_of_parent"] = float((float(child["total_kwh"]) / float(node["total_kwh"])) * 100.0)
    else:
        for child in node["children"]:
            child["percent_of_parent"] = None

    node["children"].sort(key=lambda item: float(item["total_kwh"]), reverse=True)
    node.pop("_index", None)


@router.get("/hierarchy")
def hierarchy_report(
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    enterprise_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    REPORT_REQUESTS_TOTAL.labels("hierarchy").inc()

    period_start, period_end = _pick_period(from_date, to_date)
    period_days = max((period_end - period_start).days, 1)
    prev_start = period_start - timedelta(days=period_days)
    prev_end = period_start

    current_rows_q = (
        db.query(DailyAggregation.meter_id, func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0))
        .select_from(DailyAggregation)
        .join(Site, Site.id == DailyAggregation.site_id)
        .filter(DailyAggregation.day >= period_start, DailyAggregation.day < period_end)
    )
    previous_rows_q = (
        db.query(DailyAggregation.meter_id, func.coalesce(func.sum(DailyAggregation.total_kwh), 0.0))
        .select_from(DailyAggregation)
        .join(Site, Site.id == DailyAggregation.site_id)
        .filter(DailyAggregation.day >= prev_start, DailyAggregation.day < prev_end)
    )
    if enterprise_id is not None:
        current_rows_q = current_rows_q.filter(Site.enterprise_id == enterprise_id)
        previous_rows_q = previous_rows_q.filter(Site.enterprise_id == enterprise_id)
    current_rows = current_rows_q.group_by(DailyAggregation.meter_id).all()
    previous_rows = previous_rows_q.group_by(DailyAggregation.meter_id).all()
    current_totals = _to_float_map(current_rows)
    previous_totals = _to_float_map(previous_rows)

    meter_rows = (
        db.query(
            Meter.id.label("meter_id"),
            Meter.serial_number.label("meter_serial"),
            Meter.zone_name.label("meter_zone"),
            Site.id.label("site_id"),
            Site.name.label("site_name"),
            Enterprise.id.label("enterprise_id"),
            Enterprise.name.label("enterprise_name"),
            Substation.id.label("substation_id"),
            Substation.name.label("substation_name"),
            Transformer.id.label("transformer_id"),
            Transformer.name.label("transformer_name"),
            ElectricalLine.id.label("line_id"),
            ElectricalLine.name.label("line_name"),
        )
        .join(Site, Site.id == Meter.site_id)
        .join(Enterprise, Enterprise.id == Site.enterprise_id)
        .outerjoin(ElectricalLine, ElectricalLine.id == Meter.line_id)
        .outerjoin(Transformer, Transformer.id == ElectricalLine.transformer_id)
        .outerjoin(Substation, Substation.id == Transformer.substation_id)
    )
    if enterprise_id is not None:
        meter_rows = meter_rows.filter(Enterprise.id == enterprise_id)
    meter_rows = meter_rows.all()

    root = _new_node("root", "all", "Всі підприємства")
    for row in meter_rows:
        ent_id = row.enterprise_id
        enterprise_name = row.enterprise_name or f"Підприємство {ent_id}"
        enterprise = _get_or_add_child(root, "enterprise", ent_id, enterprise_name)

        substation_id = row.substation_id if row.substation_id is not None else f"none-{ent_id}"
        substation_name = row.substation_name or "Без підстанції"
        substation = _get_or_add_child(enterprise, "substation", substation_id, substation_name)

        transformer_id = row.transformer_id if row.transformer_id is not None else f"none-{substation_id}"
        transformer_name = row.transformer_name or "Без трансформатора"
        transformer = _get_or_add_child(substation, "transformer", transformer_id, transformer_name)

        line_id = row.line_id if row.line_id is not None else f"none-{transformer_id}"
        line_name = row.line_name or "Без лінії"
        line = _get_or_add_child(transformer, "line", line_id, line_name)

        site = _get_or_add_child(line, "site", row.site_id, row.site_name or f"Об'єкт {row.site_id}")
        meter_name = f"{row.meter_serial} ({row.meter_zone})"
        meter = _get_or_add_child(site, "meter", row.meter_id, meter_name)
        meter["total_kwh"] = float(current_totals.get(int(row.meter_id), 0.0))
        meter["previous_total_kwh"] = float(previous_totals.get(int(row.meter_id), 0.0))

    _finalize_node(root)
    enterprise_meta = None
    out_tree = root["children"]
    if enterprise_id is not None:
        ent = db.query(Enterprise).filter(Enterprise.id == enterprise_id).first()
        enterprise_meta = {"id": enterprise_id, "name": ent.name if ent else f"Підприємство {enterprise_id}"}
        for ent_node in root["children"]:
            if int(ent_node["id"]) == int(enterprise_id):
                out_tree = ent_node["children"]
                break
        else:
            out_tree = []
    return {
        "period": {"from_date": period_start, "to_date": period_end},
        "previous_period": {"from_date": prev_start, "to_date": prev_end},
        "enterprise": enterprise_meta,
        "tree": out_tree,
    }
