"""
Симулятор навантаження: scenario.yaml + ENV, згладжування, offline/spike, ретраї POST.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from config_loader import SimConfig, load_scenario
from generator import MeterState, sample_interval_kwh
from poster import post_reading

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("simulator")

API_URL = os.getenv("API_URL", "http://backend:8000")
_meter_ids_env = os.getenv("METER_IDS", "").strip()
METER_IDS = [int(x) for x in _meter_ids_env.split(",") if x]

app = FastAPI(title="simulator-service", version="2.0.0")
_running = False
_meter_states: dict[int, MeterState] = {}
_current_cfg: SimConfig | None = None


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
        active: list[dict[str, Any]] = []
        for meter in meters:
            if not isinstance(meter, dict):
                continue
            if not _is_meter_active(meter):
                continue
            info = _normalize_meter_info(meter)
            if info is not None:
                active.append(info)
        if METER_IDS:
            allowed = set(METER_IDS)
            active = [m for m in active if m["id"] in allowed]
        return active
    except Exception as e:
        log.warning("Не вдалося отримати /meters: %s", e)
        return []


def _sync_states(active_ids: set[int]) -> None:
    for k in list(_meter_states.keys()):
        if k not in active_ids:
            del _meter_states[k]
    for mid in active_ids:
        _meter_states.setdefault(mid, MeterState())


async def simulation_loop() -> None:
    global _current_cfg
    meters: list[dict[str, Any]] = []
    last_m_refresh = 0.0
    async with httpx.AsyncClient(timeout=15.0) as client:
        while _running:
            cfg = load_scenario()
            _current_cfg = cfg
            now_loop = asyncio.get_running_loop().time()
            if (not meters) or (now_loop - last_m_refresh >= cfg.meters_refresh_seconds):
                meters = await _fetch_active_meters(client)
                last_m_refresh = now_loop
                _sync_states({m["id"] for m in meters})
                log.info("Оновлено список лічильників: %s активних", len(meters))

            now_mono = asyncio.get_running_loop().time()
            ts = datetime.now(timezone.utc)

            for meter in meters:
                mid = int(meter["id"])
                st = _meter_states[mid]
                kwh, _new_st = sample_interval_kwh(meter, ts, cfg.interval_seconds, cfg, st, now_mono)
                _meter_states[mid] = _new_st
                if kwh is None:
                    continue
                payload = {
                    "meter_id": mid,
                    "ts": ts.isoformat(),
                    "value_kwh": kwh,
                    "source": "simulator",
                }
                await post_reading(client, API_URL, payload, cfg)

            j = min(0.45, max(0.0, cfg.jitter_fraction))
            base = cfg.interval_seconds
            factor = random.uniform(1.0 - j, 1.0 + j) if j > 0 else 1.0
            await asyncio.sleep(max(0.05, base * factor))


@app.on_event("startup")
async def _startup():
    global _running
    log.info("Симулятор v2: scenario profile=%s", load_scenario().global_profile)
    if os.getenv("SIM_AUTOSTART", "").strip().lower() in ("1", "true", "yes"):
        if not _running:
            _running = True
            asyncio.create_task(simulation_loop())
            log.info("SIM_AUTOSTART: цикл симуляції запущено автоматично")


@app.post("/simulator/start")
async def start():
    global _running
    if not _running:
        _running = True
        asyncio.create_task(simulation_loop())
    cfg = _current_cfg or load_scenario()
    return {
        "running": _running,
        "profile": cfg.global_profile,
        "multiplier": cfg.multiplier,
        "interval_seconds": cfg.interval_seconds,
        "meters_source": "database_active_only",
        "config_path": os.getenv("SIM_CONFIG_PATH") or "(bundled scenario.yaml)",
    }


@app.post("/simulator/stop")
async def stop():
    global _running
    _running = False
    return {"running": _running}


@app.post("/simulator/reload-config")
async def reload_config():
    """Перечитати scenario.yaml з диска (наступний цикл також підхопить)."""
    cfg = load_scenario()
    global _current_cfg
    _current_cfg = cfg
    return {
        "global_profile": cfg.global_profile,
        "multiplier": cfg.multiplier,
        "interval_seconds": cfg.interval_seconds,
        "smoothing_alpha": cfg.smoothing_alpha,
    }


@app.get("/simulator/status")
def status():
    cfg = _current_cfg or load_scenario()
    return {
        "running": _running,
        "global_profile": cfg.global_profile,
        "interval_seconds": cfg.interval_seconds,
        "tracked_meters_state": len(_meter_states),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    return {"status": "ready"}


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
