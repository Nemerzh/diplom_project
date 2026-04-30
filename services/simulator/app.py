import asyncio
import os
import random
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest
from starlette.responses import Response

API_URL = os.getenv("API_URL", "http://backend:8000")
_meter_ids_env = os.getenv("METER_IDS", "").strip()
METER_IDS = [int(x) for x in _meter_ids_env.split(",") if x]
INTERVAL_SECONDS = float(os.getenv("INTERVAL_SECONDS", "2"))
METERS_REFRESH_SECONDS = float(os.getenv("METERS_REFRESH_SECONDS", "30"))
# normal | peak | critical | offline
SIM_PROFILE = os.getenv("SIM_PROFILE", "normal").strip().lower()
SIM_MULTIPLIER = float(os.getenv("SIM_MULTIPLIER", "1"))

app = FastAPI(title="simulator-service")
generated = Counter("simulated_readings_total", "Total simulated readings")
_running = False


def _is_meter_active(meter: dict[str, Any]) -> bool:
    return str(meter.get("status", "")).strip().lower() == "active"


def _extract_meter_id(meter: dict[str, Any]) -> int | None:
    try:
        value = meter.get("id")
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_meter_info(meter: dict[str, Any]) -> dict[str, Any] | None:
    meter_id = _extract_meter_id(meter)
    if meter_id is None:
        return None
    return {
        "id": meter_id,
        "meter_type": str(meter.get("meter_type", "electricity")).strip().lower(),
        "meter_role": str(meter.get("meter_role", "submeter")).strip().lower(),
        "zone_name": str(meter.get("zone_name", "default")).strip().lower(),
    }


async def _fetch_active_meters(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    try:
        response = await client.get(f"{API_URL}/meters")
        response.raise_for_status()
        meters = response.json()
        if not isinstance(meters, list):
            return []
        active_meters: list[dict[str, Any]] = []
        for meter in meters:
            if not isinstance(meter, dict):
                continue
            if not _is_meter_active(meter):
                continue
            meter_info = _normalize_meter_info(meter)
            if meter_info is not None:
                active_meters.append(meter_info)
        if METER_IDS:
            allowed = set(METER_IDS)
            active_meters = [meter for meter in active_meters if meter["id"] in allowed]
        return active_meters
    except Exception:
        return []


def _profile_factor() -> float:
    m = max(SIM_MULTIPLIER, 0.01)
    if SIM_PROFILE == "offline":
        return 0.0
    if SIM_PROFILE == "peak":
        return 1.6 * m
    if SIM_PROFILE == "critical":
        return 2.4 * m
    return 1.0 * m


def _electricity_range(hour: int, meter_role: str, zone_name: str) -> tuple[float, float]:
    is_day = 7 <= hour < 22
    if "main" in meter_role or "main" in zone_name:
        return (70.0, 150.0) if is_day else (35.0, 90.0)
    if "lighting" in meter_role or "light" in zone_name:
        return (3.0, 14.0) if is_day else (6.0, 24.0)
    if "hvac" in meter_role or "climate" in zone_name:
        return (18.0, 55.0) if is_day else (10.0, 28.0)
    if (
        "weld" in meter_role
        or "weld" in zone_name
        or "workshop" in meter_role
        or "workshop" in zone_name
        or "production" in meter_role
        or "production" in zone_name
    ):
        # Ціль: великі зони ~100-200 кВт·год за годину (при профілі normal).
        return (100.0, 200.0) if is_day else (45.0, 120.0)
    return (12.0, 42.0) if is_day else (6.0, 22.0)


def _base_range_for_meter(meter: dict[str, Any], ts: datetime) -> tuple[float, float]:
    meter_type = str(meter.get("meter_type", "electricity"))
    meter_role = str(meter.get("meter_role", "submeter"))
    zone_name = str(meter.get("zone_name", "default"))
    hour = ts.hour

    if meter_type == "electricity":
        return _electricity_range(hour, meter_role, zone_name)
    if meter_type == "water":
        return (0.2, 1.8) if 6 <= hour < 23 else (0.05, 0.6)
    if meter_type == "gas":
        return (0.3, 2.2) if 6 <= hour < 23 else (0.1, 1.1)
    if meter_type == "heat":
        cold_month_factor = 1.4 if ts.month in {11, 12, 1, 2, 3} else 1.0
        return (0.8 * cold_month_factor, 4.5 * cold_month_factor)
    return (2.0, 10.0)


def _sample_kwh(meter: dict[str, Any], ts: datetime) -> float | None:
    """Генерує реалістичні покази з урахуванням типу/ролі лічильника."""
    profile = _profile_factor()
    if profile <= 0:
        return None

    low, high = _base_range_for_meter(meter, ts)
    # low/high трактуємо як миттєву потужність у kW.
    power_kw = random.uniform(low, high) * profile

    # М'який шум + рідкісні локальні піки.
    noise = random.uniform(0.9, 1.1)
    power_kw *= noise
    if random.random() < 0.02:
        power_kw *= random.uniform(1.15, 1.45)

    # Конвертація в енергію за поточний інтервал: kWh = kW * (seconds / 3600).
    interval_hours = max(INTERVAL_SECONDS, 0.1) / 3600.0
    value_kwh = power_kw * interval_hours
    return round(max(value_kwh, 0.0001), 4)


async def loop_send():
    async with httpx.AsyncClient(timeout=10) as client:
        meters: list[dict[str, Any]] = []
        last_refresh_at = 0.0
        while _running:
            now = asyncio.get_running_loop().time()
            if (not meters) or (now - last_refresh_at >= METERS_REFRESH_SECONDS):
                meters = await _fetch_active_meters(client)
                last_refresh_at = now
            for meter in meters:
                ts = datetime.now(timezone.utc)
                kwh = _sample_kwh(meter, ts)
                if kwh is None:
                    continue
                payload = {
                    "meter_id": meter["id"],
                    "ts": ts.isoformat(),
                    "value_kwh": kwh,
                    "source": "simulator",
                }
                try:
                    await client.post(f"{API_URL}/readings", json=payload)
                    generated.inc()
                except Exception:
                    pass
            await asyncio.sleep(INTERVAL_SECONDS)


@app.post("/simulator/start")
async def start():
    global _running
    if not _running:
        _running = True
        asyncio.create_task(loop_send())
    return {
        "running": _running,
        "profile": SIM_PROFILE,
        "multiplier": SIM_MULTIPLIER,
        "meters_source": "database_active_only",
    }


@app.post("/simulator/stop")
async def stop():
    global _running
    _running = False
    return {"running": _running}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    return {"status": "ready"}


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
