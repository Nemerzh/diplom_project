"""Утиліти для роботи з часом.

Конвенція проєкту:
- На бекенді весь час зберігається/обчислюється у **UTC** (tz-aware).
- На відображення (фронт, Grafana) переводиться в **Europe/Kyiv**.
- ``datetime.utcnow()`` уникається (deprecated у Python 3.12 і повертає naive),
  замість нього використовуємо ``now_utc()`` тут.
"""

from datetime import datetime, timezone

UTC = timezone.utc


def now_utc() -> datetime:
    """Поточний час як tz-aware datetime у UTC."""
    return datetime.now(UTC)


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Якщо datetime naive — припускаємо UTC і повертаємо tz-aware.

    Корисно для сумісності зі старими записами у БД, де колонки зберігалися як
    ``timestamp without time zone``: ми завжди писали туди UTC, тож при
    прочитанні достатньо «помітити» їх як UTC.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt
