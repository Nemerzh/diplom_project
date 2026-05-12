import datetime as dt
import json
import random
import urllib.request

# Застаріло для повної топології: у Docker Compose використовуйте services/backend/scripts/compose_seed_network.py
# (автоматично через сервіс compose-seed). Цей скрипт лишено як простий приклад HTTP-наповнення.

BASE = "http://localhost:8000"


def _request(method: str, path: str, payload: dict | None = None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else {}


def main():
    sites = _request("GET", "/sites")
    if not sites:
        _request("POST", "/sites", {"enterprise_id": 1, "name": "Plant A", "location": "Kyiv"})
        _request("POST", "/sites", {"enterprise_id": 1, "name": "Plant B", "location": "Lviv"})
        sites = _request("GET", "/sites")
    meters = _request("GET", "/meters")
    if not meters:
        for site in sites:
            for idx in range(2):
                _request(
                    "POST",
                    "/meters",
                    {
                        "site_id": site["id"],
                        "serial_number": f"MTR-{site['id']}-{idx}",
                        "meter_type": "electricity",
                        "status": "active",
                    },
                )
        meters = _request("GET", "/meters")
    now = dt.datetime.utcnow()
    for m in meters:
        for i in range(96):
            ts = now - dt.timedelta(minutes=15 * i)
            _request(
                "POST",
                "/readings",
                {
                    "meter_id": m["id"],
                    "ts": ts.isoformat(),
                    "value_kwh": round(random.uniform(2, 20), 2),
                    "source": "seed",
                },
            )
    _request("POST", "/validation/run")
    _request("POST", "/reports/rebuild")
    _request("POST", "/alerts/rules", {"threshold_kwh": 500, "severity": "high"})
    _request("POST", "/alerts/run")
    print("seed complete")


if __name__ == "__main__":
    main()
