from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.metrics import metrics_endpoint, metrics_middleware
from app.routers import alerts, network, readings, registry, reports, reports_analytics, system, topology, validation


def _datetime_to_iso_utc(value: datetime) -> str:
    """Гарантуємо, що будь-який ``datetime`` у відповідях dict-ендпоінтів має
    UTC-зміщення (``+00:00``). Naive datetime трактуємо як UTC, бо колонки БД
    зберігаються в UTC семантично."""

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


ENCODERS_BY_TYPE[datetime] = _datetime_to_iso_utc


app = FastAPI(title="Бекенд обліку електроенергії", version="0.1.0")
app.middleware("http")(metrics_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(registry.router)
app.include_router(network.router)
app.include_router(topology.router)
app.include_router(readings.router)
app.include_router(validation.router)
app.include_router(reports.router)
app.include_router(reports_analytics.router)
app.include_router(alerts.router)
app.add_api_route("/metrics", metrics_endpoint, methods=["GET"], tags=["system"])
