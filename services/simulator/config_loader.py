"""Завантаження scenario.yaml + перекриття з ENV (зворотна сумісність з compose)."""

from __future__ import annotations

import os
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

_LOG = __import__("logging").getLogger(__name__)

EMBEDDED_DEFAULTS: dict[str, Any] = {
    "defaults": {
        "interval_seconds": 2.0,
        "jitter_fraction": 0.12,
        "meters_refresh_seconds": 30.0,
        "global_profile": "normal",
        "multiplier": 1.0,
        "smoothing_alpha": 0.38,
        "post": {"max_retries": 4, "backoff_seconds": 0.4, "backoff_multiplier": 2.0},
    },
    "events": {
        "spike_probability": 0.022,
        "spike_factor_min": 1.12,
        "spike_factor_max": 1.5,
        "offline": {
            "probability_per_tick": 0.0004,
            "duration_min_seconds": 45,
            "duration_max_seconds": 600,
        },
    },
    "meter_overrides": {},
}


def _deep_merge(base: dict, override: dict) -> dict:
    out = deepcopy(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = deepcopy(v)
    return out


def _parse_profile(v: str) -> str:
    x = str(v or "normal").strip().lower()
    return x if x in ("normal", "peak", "critical", "offline") else "normal"


@dataclass
class SimConfig:
    interval_seconds: float
    jitter_fraction: float
    meters_refresh_seconds: float
    global_profile: str
    multiplier: float
    smoothing_alpha: float
    post_max_retries: int
    post_backoff_seconds: float
    post_backoff_multiplier: float
    spike_probability: float
    spike_factor_min: float
    spike_factor_max: float
    offline_prob_per_tick: float
    offline_duration_min: float
    offline_duration_max: float
    meter_overrides: dict[str, dict[str, Any]] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)


def _build_sim_config(merged: dict[str, Any]) -> SimConfig:
    d = merged.get("defaults") or {}
    ev = merged.get("events") or {}
    off = ev.get("offline") or {}
    post = d.get("post") or {}
    mo = merged.get("meter_overrides") or {}
    # нормалізуємо ключі meter_overrides до str
    overrides: dict[str, dict[str, Any]] = {}
    for k, v in mo.items():
        if isinstance(v, dict):
            overrides[str(k)] = dict(v)
    return SimConfig(
        interval_seconds=float(d.get("interval_seconds", 2.0)),
        jitter_fraction=float(d.get("jitter_fraction", 0.0)),
        meters_refresh_seconds=float(d.get("meters_refresh_seconds", 30.0)),
        global_profile=_parse_profile(d.get("global_profile", "normal")),
        multiplier=float(d.get("multiplier", 1.0)),
        smoothing_alpha=float(d.get("smoothing_alpha", 0.35)),
        post_max_retries=int(post.get("max_retries", 4)),
        post_backoff_seconds=float(post.get("backoff_seconds", 0.4)),
        post_backoff_multiplier=float(post.get("backoff_multiplier", 2.0)),
        spike_probability=float(ev.get("spike_probability", 0.02)),
        spike_factor_min=float(ev.get("spike_factor_min", 1.12)),
        spike_factor_max=float(ev.get("spike_factor_max", 1.5)),
        offline_prob_per_tick=float(off.get("probability_per_tick", 0.0004)),
        offline_duration_min=float(off.get("duration_min_seconds", 45)),
        offline_duration_max=float(off.get("duration_max_seconds", 600)),
        meter_overrides=overrides,
        raw=merged,
    )


def load_scenario() -> SimConfig:
    path = os.getenv("SIM_CONFIG_PATH", "").strip()
    if not path:
        # сценарій поруч з app у образі
        here = Path(__file__).resolve().parent
        candidate = here / "scenario.yaml"
        path = str(candidate) if candidate.is_file() else ""

    merged = deepcopy(EMBEDDED_DEFAULTS)
    if path and Path(path).is_file():
        try:
            with open(path, encoding="utf-8") as f:
                file_data = yaml.safe_load(f) or {}
            if isinstance(file_data, dict):
                merged = _deep_merge(merged, file_data)
        except Exception as e:
            _LOG.warning("Не вдалося прочитати %s: %s — використовую вбудовані defaults", path, e)

    # ENV overwrite (як раніше в docker-compose)
    d = merged.setdefault("defaults", {})
    if os.getenv("INTERVAL_SECONDS"):
        d["interval_seconds"] = float(os.environ["INTERVAL_SECONDS"])
    if os.getenv("METERS_REFRESH_SECONDS"):
        d["meters_refresh_seconds"] = float(os.environ["METERS_REFRESH_SECONDS"])
    if os.getenv("SIM_PROFILE"):
        d["global_profile"] = _parse_profile(os.environ["SIM_PROFILE"])
    if os.getenv("SIM_MULTIPLIER"):
        d["multiplier"] = float(os.environ["SIM_MULTIPLIER"])

    return _build_sim_config(merged)
