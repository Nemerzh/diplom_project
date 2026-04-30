from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.requests import Request
from starlette.responses import Response

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status_code"],
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "path"],
)

RECEIVED_READINGS_TOTAL = Counter("received_readings_total", "Total raw readings received")
VALIDATED_READINGS_TOTAL = Counter("validated_readings_total", "Total validated readings")
ALERTS_GENERATED_TOTAL = Counter("alerts_generated_total", "Total alerts generated")
REPORT_REQUESTS_TOTAL = Counter("report_requests_total", "Total report requests", ["report_type"])


async def metrics_endpoint() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


async def metrics_middleware(request: Request, call_next):
    method = request.method
    path = request.url.path
    with REQUEST_LATENCY.labels(method, path).time():
        response = await call_next(request)
    REQUEST_COUNT.labels(method, path, response.status_code).inc()
    return response
