"""
Агрегація навантаження знизу вгору: лічильник → … → лінія → підстанція.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.metrics import ALERTS_GENERATED_TOTAL
from app.models import (
    Alert,
    ElectricalLine,
    LoadSnapshot,
    Meter,
    RawReading,
    Site,
    Substation,
    Transformer,
)

WINDOW_MINUTES = int(os.getenv("TOPOLOGY_WINDOW_MINUTES", "15"))
# Якщо останній показ старіший — вузол вважаємо offline
OFFLINE_MINUTES = int(os.getenv("TOPOLOGY_OFFLINE_MINUTES", "30"))

# Дефолтні пороги, кВт (якщо в БД null)
DEFAULT_LINE_WARN_KW = 150.0
DEFAULT_LINE_CRIT_KW = 300.0
DEFAULT_SUB_WARN_KW = 500.0
DEFAULT_SUB_CRIT_KW = 1000.0


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _thresholds_line(line: ElectricalLine) -> tuple[float, float]:
    w = line.threshold_warning_kw
    c = line.threshold_critical_kw
    if w is None:
        w = DEFAULT_LINE_WARN_KW
    if c is None:
        c = DEFAULT_LINE_CRIT_KW
    return (w, c)


def _thresholds_sub(s: Substation) -> tuple[float, float]:
    if s.rated_capacity_kw and s.rated_capacity_kw > 0:
        w = s.threshold_warning_kw if s.threshold_warning_kw is not None else 0.7 * s.rated_capacity_kw
        c = s.threshold_critical_kw if s.threshold_critical_kw is not None else 0.9 * s.rated_capacity_kw
        return (w, c)
    w = s.threshold_warning_kw if s.threshold_warning_kw is not None else DEFAULT_SUB_WARN_KW
    c = s.threshold_critical_kw if s.threshold_critical_kw is not None else DEFAULT_SUB_CRIT_KW
    return (w, c)


def _classify_status(load_kw: float, is_offline: bool, warn: float, crit: float) -> str:
    if is_offline:
        return "offline"
    if load_kw >= crit:
        return "critical"
    if load_kw >= warn:
        return "warning"
    return "normal"


@dataclass
class RecomputeResult:
    snapshots_written: int
    alerts_created: int


def recompute_topology_load(db: Session) -> RecomputeResult:
    now = _now_utc()
    window_start = now - timedelta(minutes=WINDOW_MINUTES)
    offline_before = now - timedelta(minutes=OFFLINE_MINUTES)
    hours = max(WINDOW_MINUTES / 60.0, 1e-6)

    meters: list[Meter] = db.query(Meter).all()
    sites: list[Site] = db.query(Site).all()
    lines: list[ElectricalLine] = db.query(ElectricalLine).all()
    substations: list[Substation] = db.query(Substation).all()
    transformers: list[Transformer] = db.query(Transformer).all()

    def _ts_aware(ts: datetime | None) -> datetime | None:
        if ts is None:
            return None
        if ts.tzinfo is None:
            return ts.replace(tzinfo=timezone.utc)
        return ts

    # --- per meter: останній показ для offline; сума kWh у вікні → середня потужність кВт
    meter_load_kw: dict[int, float] = {}
    meter_offline: dict[int, bool] = {}
    for m in meters:
        last_ts = db.query(func.max(RawReading.ts)).filter(RawReading.meter_id == m.id).scalar()
        last_ts = _ts_aware(last_ts)
        if last_ts is None or last_ts < offline_before:
            meter_load_kw[m.id] = 0.0
            meter_offline[m.id] = True
            continue
        total_kwh = (
            db.query(func.coalesce(func.sum(RawReading.value_kwh), 0.0))
            .filter(RawReading.meter_id == m.id, RawReading.ts >= window_start)
            .scalar()
        )
        meter_load_kw[m.id] = float(total_kwh or 0) / hours
        meter_offline[m.id] = False

    # site
    site_load: dict[int, float] = {}
    site_offline: dict[int, bool] = {}
    for s in sites:
        mids = [m.id for m in meters if m.site_id == s.id]
        if not mids:
            site_load[s.id] = 0.0
            site_offline[s.id] = True
            continue
        load = sum(meter_load_kw.get(mid, 0.0) for mid in mids)
        off = all(meter_offline.get(mid, True) for mid in mids)
        site_load[s.id] = load
        site_offline[s.id] = off

    # line: сумуємо всі лічильники з line_id
    line_load: dict[int, float] = {}
    line_offline: dict[int, bool] = {}
    for line in lines:
        mids = [m.id for m in meters if m.line_id == line.id]
        if not mids:
            line_load[line.id] = 0.0
            line_offline[line.id] = True
            continue
        load = sum(meter_load_kw.get(mid, 0.0) for mid in mids)
        off = all(meter_offline.get(mid, True) for mid in mids)
        line_load[line.id] = load
        line_offline[line.id] = off

    # transformer: сума ліній під трансформатором
    tr_lines: dict[int, list[int]] = {}
    for line in lines:
        tr_lines.setdefault(line.transformer_id, []).append(line.id)

    tr_load: dict[int, float] = {}
    tr_offline: dict[int, bool] = {}
    for tr in transformers:
        lids = tr_lines.get(tr.id, [])
        if not lids:
            tr_load[tr.id] = 0.0
            tr_offline[tr.id] = True
            continue
        tr_load[tr.id] = sum(line_load.get(lid, 0.0) for lid in lids)
        tr_offline[tr.id] = all(line_offline.get(lid, True) for lid in lids)

    # substation: сума трансформаторів під ПС
    sub_load: dict[int, float] = {}
    sub_offline: dict[int, bool] = {}
    for sub in substations:
        tids = [tr.id for tr in transformers if tr.substation_id == sub.id]
        if not tids:
            sub_load[sub.id] = 0.0
            sub_offline[sub.id] = True
            continue
        load = sum(tr_load.get(tid, 0.0) for tid in tids)
        off = all(tr_offline.get(tid, True) for tid in tids)
        sub_load[sub.id] = load
        sub_offline[sub.id] = off

    # --- upsert snapshots (PostgreSQL)
    rows: list[dict] = []
    for mid, lw in meter_load_kw.items():
        st = _classify_status(lw, meter_offline.get(mid, True), float("inf"), float("inf"))
        rows.append(
            {"node_type": "meter", "node_id": mid, "load_kw": lw, "node_status": st, "computed_at": now}
        )
    for sid, lw in site_load.items():
        rows.append(
            {
                "node_type": "site",
                "node_id": sid,
                "load_kw": lw,
                "node_status": _classify_status(lw, site_offline.get(sid, True), float("inf"), float("inf")),
                "computed_at": now,
            }
        )
    for line in lines:
        lw = line_load.get(line.id, 0.0)
        lo = line_offline.get(line.id, True)
        w, c = _thresholds_line(line)
        st = _classify_status(lw, lo, w, c)
        rows.append({"node_type": "line", "node_id": line.id, "load_kw": lw, "node_status": st, "computed_at": now})

    for tr in transformers:
        lw = tr_load.get(tr.id, 0.0)
        lo = tr_offline.get(tr.id, True)
        rows.append(
            {
                "node_type": "transformer",
                "node_id": tr.id,
                "load_kw": lw,
                "node_status": _classify_status(lw, lo, float("inf"), float("inf")),
                "computed_at": now,
            }
        )

    for sub in substations:
        lw = sub_load.get(sub.id, 0.0)
        lo = sub_offline.get(sub.id, True)
        w, c = _thresholds_sub(sub)
        st = _classify_status(lw, lo, w, c)
        rows.append(
            {"node_type": "substation", "node_id": sub.id, "load_kw": lw, "node_status": st, "computed_at": now}
        )

    db.query(LoadSnapshot).delete()
    if rows:
        db.bulk_insert_mappings(LoadSnapshot, rows)

    # оновити node_status на сутностях
    for line in lines:
        lw = line_load.get(line.id, 0.0)
        lo = line_offline.get(line.id, True)
        w, c = _thresholds_line(line)
        line.node_status = _classify_status(lw, lo, w, c)
    for sub in substations:
        lw = sub_load.get(sub.id, 0.0)
        lo = sub_offline.get(sub.id, True)
        w, c = _thresholds_sub(sub)
        sub.node_status = _classify_status(lw, lo, w, c)

    alerts_created = _emit_topology_alerts(
        db,
        now,
        lines,
        transformers,
        substations,
        line_load,
        line_offline,
        tr_load,
        tr_offline,
        sub_load,
        sub_offline,
    )

    db.commit()
    return RecomputeResult(snapshots_written=len(rows), alerts_created=alerts_created)


def _emit_topology_alerts(
    db: Session,
    now: datetime,
    lines: list[ElectricalLine],
    transformers: list[Transformer],
    substations: list[Substation],
    line_load: dict[int, float],
    line_offline: dict[int, bool],
    tr_load: dict[int, float],
    tr_offline: dict[int, bool],
    sub_load: dict[int, float],
    sub_offline: dict[int, bool],
) -> int:
    def has_open_tr(kind: str, tr_id: int) -> bool:
        return (
            db.query(Alert)
            .filter(
                Alert.resolved_at.is_(None),
                Alert.alert_type == kind,
                Alert.transformer_id == tr_id,
                Alert.substation_id.is_(None),
                Alert.line_id.is_(None),
            )
            .first()
            is not None
        )

    created = 0

    def has_open_line(kind: str, line_id: int) -> bool:
        return (
            db.query(Alert)
            .filter(
                Alert.resolved_at.is_(None),
                Alert.alert_type == kind,
                Alert.line_id == line_id,
                Alert.substation_id.is_(None),
            )
            .first()
            is not None
        )

    def has_open_sub(kind: str, sub_id: int) -> bool:
        return (
            db.query(Alert)
            .filter(
                Alert.resolved_at.is_(None),
                Alert.alert_type == kind,
                Alert.substation_id == sub_id,
                Alert.line_id.is_(None),
            )
            .first()
            is not None
        )

    for line in lines:
        lw = line_load.get(line.id, 0.0)
        lo = line_offline.get(line.id, True)
        w, c = _thresholds_line(line)
        st = _classify_status(lw, lo, w, c)
        if st == "offline":
            if not has_open_line("topology_line_offline", line.id):
                db.add(
                    Alert(
                        meter_id=None,
                        site_id=None,
                        substation_id=None,
                        transformer_id=None,
                        line_id=line.id,
                        alert_type="topology_line_offline",
                        severity="medium",
                        message=f"Лінія {line.code}: немає свіжих показів (offline)",
                        created_at=now,
                    )
                )
                created += 1
                ALERTS_GENERATED_TOTAL.inc()
        elif st == "critical":
            if not has_open_line("topology_line_critical", line.id):
                db.add(
                    Alert(
                        meter_id=None,
                        site_id=None,
                        substation_id=None,
                        transformer_id=None,
                        line_id=line.id,
                        alert_type="topology_line_critical",
                        severity="high",
                        message=f"Лінія {line.code}: навантаження {lw:.1f} кВт ≥ критичного порогу ({c:.1f} кВт)",
                        created_at=now,
                    )
                )
                created += 1
                ALERTS_GENERATED_TOTAL.inc()
        elif st == "warning":
            if not has_open_line("topology_line_warning", line.id):
                db.add(
                    Alert(
                        meter_id=None,
                        site_id=None,
                        substation_id=None,
                        transformer_id=None,
                        line_id=line.id,
                        alert_type="topology_line_warning",
                        severity="medium",
                        message=f"Лінія {line.code}: навантаження {lw:.1f} кВт ≥ порогу попередження ({w:.1f} кВт)",
                        created_at=now,
                    )
                )
                created += 1
                ALERTS_GENERATED_TOTAL.inc()

    for tr in transformers:
        lw = tr_load.get(tr.id, 0.0)
        lo = tr_offline.get(tr.id, True)
        st = _classify_status(lw, lo, float("inf"), float("inf"))
        if st == "offline" and not has_open_tr("topology_tr_offline", tr.id):
            db.add(
                Alert(
                    meter_id=None,
                    site_id=None,
                    substation_id=None,
                    transformer_id=tr.id,
                    line_id=None,
                    alert_type="topology_tr_offline",
                    severity="medium",
                    message=f"Трансформатор {tr.code}: offline / немає даних",
                    created_at=now,
                )
            )
            created += 1
            ALERTS_GENERATED_TOTAL.inc()

    for sub in substations:
        lw = sub_load.get(sub.id, 0.0)
        lo = sub_offline.get(sub.id, True)
        w, c = _thresholds_sub(sub)
        st = _classify_status(lw, lo, w, c)
        if st == "offline":
            if not has_open_sub("topology_sub_offline", sub.id):
                db.add(
                    Alert(
                        meter_id=None,
                        site_id=None,
                        substation_id=sub.id,
                        transformer_id=None,
                        line_id=None,
                        alert_type="topology_sub_offline",
                        severity="medium",
                        message=f"Підстанція {sub.code}: offline / немає даних",
                        created_at=now,
                    )
                )
                created += 1
                ALERTS_GENERATED_TOTAL.inc()
        elif st == "critical":
            if not has_open_sub("topology_sub_critical", sub.id):
                db.add(
                    Alert(
                        meter_id=None,
                        site_id=None,
                        substation_id=sub.id,
                        transformer_id=None,
                        line_id=None,
                        alert_type="topology_sub_critical",
                        severity="high",
                        message=f"Підстанція {sub.code}: навантаження {lw:.1f} кВт ≥ критичного ({c:.1f} кВт)",
                        created_at=now,
                    )
                )
                created += 1
                ALERTS_GENERATED_TOTAL.inc()
        elif st == "warning":
            if not has_open_sub("topology_sub_warning", sub.id):
                db.add(
                    Alert(
                        meter_id=None,
                        site_id=None,
                        substation_id=sub.id,
                        transformer_id=None,
                        line_id=None,
                        alert_type="topology_sub_warning",
                        severity="medium",
                        message=f"Підстанція {sub.code}: навантаження {lw:.1f} кВт ≥ порогу ({w:.1f} кВт)",
                        created_at=now,
                    )
                )
                created += 1
                ALERTS_GENERATED_TOTAL.inc()

    return created
