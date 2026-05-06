"""
Сквозний інтеграційний сценарій (потрібен запущений бекенд + Postgres із seed-даними).

Очікування по кроках:
┌─────┬─────────────────────────┬──────────┬────────────────────────────────────────────┐
│  #  │ Запит                   │ HTTP     │ Інваріанти відповіді                        │
├─────┼─────────────────────────┼──────────┼────────────────────────────────────────────┤
│  1  │ GET /health             │ 200      │ JSON містить status == "працює"            │
│  2  │ GET /ready              │ 200      │ JSON містить status == "готово"          │
│  3  │ GET /meters             │ 200      │ непорожній список (є хоча б один лічильник) │
│  4  │ POST /alerts/rules      │ 200      │ {"id": <int>} — створено правило порогу    │
│  5  │ POST /readings          │ 200      │ reading з тим самим meter_id, value_kwh    │
│     │                         │          │ (після збереження тригериться sync + alerts)│
│  6  │ GET /alerts?meter_id=   │ 200      │ ≥1 активний alert для цього лічильника      │
│  7  │ POST /reports/rebuild   │ 200      │ {"daily": int>=0, "monthly": int>=0}       │
└─────┴─────────────────────────┴──────────┴────────────────────────────────────────────┘

Запуск з каталогу services/backend:

    pip install -r requirements-dev.txt
    pytest tests/test_api_pipeline_integration.py -v
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

pytestmark = pytest.mark.integration


def test_health_and_ready(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "працює"}

    r2 = client.get("/ready")
    assert r2.status_code == 200
    assert r2.json().get("status") == "готово"


def test_pipeline_reading_alert_rebuild(client):
    rm = client.get("/meters")
    assert rm.status_code == 200
    meters = rm.json()
    if not meters:
        pytest.skip("у БД немає лічильників — потрібен seed (docker compose + alembic)")

    meter_id = meters[0]["id"]

    rule_payload = {
        "meter_id": meter_id,
        "rule_type": "threshold",
        "threshold_kwh": 0.01,
        "severity": "medium",
        "window_days": 30,
        "enabled": True,
    }
    rr = client.post("/alerts/rules", json=rule_payload)
    assert rr.status_code == 200, rr.text
    rule_body = rr.json()
    assert "id" in rule_body and isinstance(rule_body["id"], int)

    ts = datetime.now(timezone.utc)
    reading_payload = {
        "meter_id": meter_id,
        "ts": ts.isoformat(),
        "value_kwh": 25.0,
        "source": "pytest",
    }
    pr = client.post("/readings", json=reading_payload)
    assert pr.status_code == 200, pr.text
    body = pr.json()
    assert body["meter_id"] == meter_id
    assert body["value_kwh"] == 25.0

    ar = client.get("/alerts", params={"meter_id": meter_id, "active_only": True})
    assert ar.status_code == 200
    alerts = ar.json()
    assert isinstance(alerts, list)
    assert len(alerts) >= 1
    assert any(a.get("meter_id") == meter_id and a.get("is_active") for a in alerts)

    rb = client.post("/reports/rebuild")
    assert rb.status_code == 200
    rep = rb.json()
    assert "daily" in rep and "monthly" in rep
    assert rep["daily"] >= 0 and rep["monthly"] >= 0
