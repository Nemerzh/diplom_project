"""POST /readings з ретраями."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from config_loader import SimConfig
from sim_metrics import simulator_post_errors_total, simulator_post_retries_total, simulated_readings_total

log = logging.getLogger(__name__)


async def post_reading(client: httpx.AsyncClient, api_url: str, payload: dict[str, Any], cfg: SimConfig) -> bool:
    url = f"{api_url.rstrip('/')}/readings"
    max_r = max(0, cfg.post_max_retries)
    delay = max(0.05, cfg.post_backoff_seconds)
    mult = max(1.0, cfg.post_backoff_multiplier)

    last_exc: Exception | None = None
    for attempt in range(max_r + 1):
        try:
            r = await client.post(url, json=payload)
            if r.is_success:
                simulated_readings_total.inc()
                return True
            body = (r.text or "")[:500]
            log.warning("POST readings HTTP %s: %s", r.status_code, body)
            last_exc = RuntimeError(f"HTTP {r.status_code}")
        except Exception as e:
            last_exc = e
            log.warning("POST readings error (attempt %s/%s): %s", attempt + 1, max_r + 1, e)

        if attempt < max_r:
            simulator_post_retries_total.inc()
            await asyncio.sleep(delay)
            delay *= mult

    simulator_post_errors_total.inc()
    log.error("POST readings failed after %s attempts: %s", max_r + 1, last_exc)
    return False
