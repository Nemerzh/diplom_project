"""Інкрементальне оновлення денних/місячних агрегатів після нового валідованого показу."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import DailyAggregation, MonthlyAggregation
from app.utils.timeutils import now_utc


def _naive_day(ts: datetime) -> datetime:
    """Вирівнювання під date_trunc('day') для TIMESTAMP, збереженого як UTC без tz."""
    if ts.tzinfo is not None:
        ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
    return ts.replace(hour=0, minute=0, second=0, microsecond=0)


def _naive_month(ts: datetime) -> datetime:
    if ts.tzinfo is not None:
        ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
    return ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def bump_daily_monthly_totals(
    db: Session, *, meter_id: int, site_id: int, ts: datetime, delta_kwh: float
) -> None:
    """Додає delta_kwh до рядків daily / monthly за відповідними bucket-ами (UPSERT)."""
    if delta_kwh == 0:
        return
    now = now_utc()
    day = _naive_day(ts)
    month = _naive_month(ts)

    d_ins = insert(DailyAggregation).values(
        meter_id=meter_id,
        site_id=site_id,
        day=day,
        total_kwh=delta_kwh,
        updated_at=now,
    )
    db.execute(
        d_ins.on_conflict_do_update(
            constraint="uq_daily_meter_day",
            set_={
                "total_kwh": DailyAggregation.total_kwh + delta_kwh,
                "site_id": site_id,
                "updated_at": now,
            },
        )
    )

    m_ins = insert(MonthlyAggregation).values(
        meter_id=meter_id,
        site_id=site_id,
        month=month,
        total_kwh=delta_kwh,
        updated_at=now,
    )
    db.execute(
        m_ins.on_conflict_do_update(
            constraint="uq_monthly_meter_month",
            set_={
                "total_kwh": MonthlyAggregation.total_kwh + delta_kwh,
                "site_id": site_id,
                "updated_at": now,
            },
        )
    )
