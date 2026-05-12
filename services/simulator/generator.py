"""Генерація кВт·год за інтервал: добовий шаблон, згладжування, події offline/spike."""

from __future__ import annotations

import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from config_loader import SimConfig


@dataclass
class MeterState:
    last_power_kw: float = 0.0
    offline_until_mono: float = 0.0
    tick_idx: int = 0


def _profile_tier_scale(cfg: SimConfig) -> float:
    """Множник режиму (без SIM_MULTIPLIER — він окремо)."""
    p = cfg.global_profile
    if p == "offline":
        return 0.0
    if p == "peak":
        return 1.6
    if p == "critical":
        return 2.4
    return 1.0


def _effective_multiplier(cfg: SimConfig, meter_id: int) -> float:
    ov = cfg.meter_overrides.get(str(meter_id)) or {}
    if "multiplier" in ov:
        try:
            return max(float(ov["multiplier"]), 0.01)
        except (TypeError, ValueError):
            pass
    return max(cfg.multiplier, 0.01)


def _electricity_range(hour: int, meter_role: str, zone_name: str) -> tuple[float, float]:
    """Діапазони кВт·год за інтервал для electricity; підтримка українських та англійських ключових слів у ролі/зоні."""
    is_day = 7 <= hour < 22
    mr = (meter_role or "").lower()
    zn = (zone_name or "").lower()
    b = f"{mr} {zn}"

    def main_tier() -> tuple[float, float]:
        return (70.0, 150.0) if is_day else (35.0, 90.0)

    def light_tier() -> tuple[float, float]:
        return (3.0, 14.0) if is_day else (6.0, 24.0)

    def hvac_tier() -> tuple[float, float]:
        return (18.0, 55.0) if is_day else (10.0, 28.0)

    def heavy_tier() -> tuple[float, float]:
        return (100.0, 200.0) if is_day else (45.0, 120.0)

    def default_tier() -> tuple[float, float]:
        return (12.0, 42.0) if is_day else (6.0, 22.0)

    # Головний облік (і старі ключі main)
    if (
        "головн" in b
        or ("загальн" in b and "облік" in b)
        or "main" in mr
        or "main" in zn
    ):
        return main_tier()
    # Освітлення
    if any(
        k in b
        for k in (
            "освітл",
            "світло",
            "ліхтар",
            "світлодіод",
            "lighting",
            "light",
        )
    ):
        return light_tier()
    # Вентиляція, клімат, кондиціювання
    if any(
        k in b
        for k in (
            "вентил",
            "клімат",
            "кондиці",
            "аспіра",
            "теплов",
            "опалюв",
            "hvac",
            "climate",
        )
    ):
        return hvac_tier()
    # Виробничі навантаження, цех, прокат, прес, зварка, лінії
    if any(
        k in b
        for k in (
            "weld",
            "workshop",
            "production",
            "звар",
            "цех",
            "вироб",
            "прес",
            "прокат",
            "екструз",
            "гранул",
            "електродвиг",
            "навантаж",
            "лінія",
            "стан",
            "кран",
            "ремонт",
            "лаборат",
            "вимір",
            "компресор",
            "насос",
        )
    ):
        return heavy_tier()
    return default_tier()


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
        cold = 1.4 if ts.month in {11, 12, 1, 2, 3} else 1.0
        return (0.8 * cold, 4.5 * cold)
    return (2.0, 10.0)


def _merged_multiplier(cfg: SimConfig, meter_id: int) -> float:
    ov = cfg.meter_overrides.get(str(meter_id)) or {}
    base = cfg.multiplier
    if "multiplier" in ov:
        try:
            return max(float(ov["multiplier"]), 0.01) * (base / max(cfg.multiplier, 0.01))  # too clever
        except (TypeError, ValueError):
            pass
    return max(cfg.multiplier, 0.01)


def _per_meter_alpha(cfg: SimConfig, meter_id: int) -> float:
    ov = cfg.meter_overrides.get(str(meter_id)) or {}
    if "smoothing_alpha" in ov:
        try:
            a = float(ov["smoothing_alpha"])
            return min(1.0, max(0.05, a))
        except (TypeError, ValueError):
            pass
    return min(1.0, max(0.05, cfg.smoothing_alpha))


def sample_interval_kwh(
    meter: dict[str, Any],
    ts: datetime,
    interval_seconds: float,
    cfg: SimConfig,
    state: MeterState,
    now_mono: float,
) -> tuple[float | None, MeterState]:
    """
    Повертає (value_kwh або None якщо offline), оновлений стан.
    """
    meter_id = int(meter["id"])
    ov = cfg.meter_overrides.get(str(meter_id)) or {}

    state.tick_idx += 1
    every_n = int(ov.get("emit_every_n_ticks") or 1)
    if every_n > 1 and (state.tick_idx % every_n != 0):
        return None, state

    tier = _profile_tier_scale(cfg)
    if tier <= 0:
        return None, state

    eff_m = _effective_multiplier(cfg, meter_id)

    # подія offline (немає показу протягом випадкової тривалості)
    if now_mono < state.offline_until_mono:
        return None, state
    if cfg.offline_prob_per_tick > 0 and random.random() < cfg.offline_prob_per_tick:
        dur = random.uniform(cfg.offline_duration_min, cfg.offline_duration_max)
        state.offline_until_mono = now_mono + dur
        return None, state

    low, high = _base_range_for_meter(meter, ts)
    target_kw = random.uniform(low, high) * tier * eff_m

    alpha = _per_meter_alpha(cfg, meter_id)
    if state.last_power_kw <= 0:
        smooth_kw = target_kw
    else:
        smooth_kw = alpha * target_kw + (1.0 - alpha) * state.last_power_kw

    noise = random.uniform(0.92, 1.08)
    smooth_kw *= noise

    if random.random() < cfg.spike_probability:
        smooth_kw *= random.uniform(cfg.spike_factor_min, cfg.spike_factor_max)

    state.last_power_kw = smooth_kw

    interval_hours = max(interval_seconds, 0.05) / 3600.0
    value_kwh = smooth_kw * interval_hours
    return round(max(value_kwh, 0.0001), 4), state
