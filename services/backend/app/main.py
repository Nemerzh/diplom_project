from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.metrics import metrics_endpoint, metrics_middleware
from app.routers import alerts, network, readings, registry, reports, system, topology, validation

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
app.include_router(alerts.router)
app.add_api_route("/metrics", metrics_endpoint, methods=["GET"], tags=["system"])
