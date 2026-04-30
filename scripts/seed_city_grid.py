import datetime as dt
import json
import random
import urllib.request

BASE = "http://localhost:8000"


def req(method: str, path: str, payload: dict | None = None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else {}


def ensure_city():
    cities = req("GET", "/network/cities")
    city = next((c for c in cities if c["name"] == "Львів"), None)
    if city:
        return city["id"]
    row = req("POST", "/network/cities", {"name": "Львів", "region": "Львівська область"})
    return row["id"]


def ensure_enterprise(name: str, city_id: int):
    enterprises = req("GET", "/enterprises")
    row = next((e for e in enterprises if e["name"] == name), None)
    if row:
        return row["id"]
    return req("POST", "/enterprises", {"name": name, "city_id": city_id})["id"]


def ensure_site(enterprise_id: int, name: str, location: str):
    sites = req("GET", "/sites")
    row = next((s for s in sites if s["enterprise_id"] == enterprise_id and s["name"] == name), None)
    if row:
        return row["id"]
    return req("POST", "/sites", {"enterprise_id": enterprise_id, "name": name, "location": location})["id"]


def seed_grid_for_enterprise(ent_id: int, ent_code: str):
    substations = req("GET", f"/network/substations?enterprise_id={ent_id}")
    sub = next((s for s in substations if s["code"] == f"PS-{ent_code}"), None)
    if not sub:
        sub = req(
            "POST",
            "/network/substations",
            {
                "enterprise_id": ent_id,
                "code": f"PS-{ent_code}",
                "name": f"ПС {ent_code}",
                "voltage_in_kv": 110,
                "voltage_out_kv": 10,
            },
        )
    transformers = req("GET", f"/network/transformers?substation_id={sub['id']}")
    transformer_ids = []
    for idx, kva in enumerate((1600, 1000), start=1):
        code = f"T-{ent_code}-{idx}"
        t = next((x for x in transformers if x["code"] == code), None)
        if not t:
            t = req(
                "POST",
                "/network/transformers",
                {
                    "substation_id": sub["id"],
                    "code": code,
                    "name": f"Трансформатор {idx}",
                    "rated_power_kva": kva,
                    "voltage_in_kv": 10,
                    "voltage_out_kv": 0.4,
                    "status": "active",
                },
            )
        transformer_ids.append(t["id"])
    point_ids = []
    for t_id in transformer_ids:
        t_lines = req("GET", f"/network/lines?transformer_id={t_id}")
        for line_idx in range(1, 3):
            line_code = f"L-{ent_code}-{t_id}-{line_idx}"
            line = next((x for x in t_lines if x["code"] == line_code), None)
            if not line:
                line = req(
                    "POST",
                    "/network/lines",
                    {
                        "transformer_id": t_id,
                        "code": line_code,
                        "name": f"Лінія {line_idx}",
                        "voltage_kv": 0.4,
                        "status": "active",
                    },
                )
            line_points = req("GET", f"/network/meter-points?line_id={line['id']}")
            point_code = f"MP-{ent_code}-{line['id']}"
            point = next((x for x in line_points if x["code"] == point_code), None)
            if not point:
                point = req(
                    "POST",
                    "/network/meter-points",
                    {
                        "line_id": line["id"],
                        "code": point_code,
                        "name": f"Точка обліку {line_idx}",
                        "point_type": "line_end",
                    },
                )
            point_ids.append(point["id"])
    return point_ids


def create_meters(site_id: int, point_ids: list[int], ent_code: str):
    existing = req("GET", "/meters")
    created = []
    for idx, mp_id in enumerate(point_ids, start=1):
        serial = f"MTR-{ent_code}-{idx:03d}"
        if any(m["serial_number"] == serial for m in existing):
            continue
        meter = req(
            "POST",
            "/meters",
            {
                "site_id": site_id,
                "meter_point_id": mp_id,
                "serial_number": serial,
                "meter_type": "electricity",
                "status": "active",
            },
        )
        created.append(meter["id"])
    return created


def create_readings():
    meters = req("GET", "/meters")
    now = dt.datetime.utcnow()
    for meter in meters:
        for i in range(48):
            ts = now - dt.timedelta(minutes=15 * i)
            req(
                "POST",
                "/readings",
                {
                    "meter_id": meter["id"],
                    "ts": ts.isoformat(),
                    "value_kwh": round(random.uniform(3, 25), 2),
                    "source": "seed_grid",
                },
            )


def main():
    city_id = ensure_city()
    enterprises = [
        ("Львівмаш", "LVM", "Промислова, 1"),
        ("ЛьвівХарчПром", "LVP", "Енергетична, 12"),
        ("ЛьвівЛогістик", "LVL", "Транспортна, 7"),
    ]
    for name, code, location in enterprises:
        ent_id = ensure_enterprise(name, city_id)
        site_id = ensure_site(ent_id, f"{name} майданчик", location)
        point_ids = seed_grid_for_enterprise(ent_id, code)
        create_meters(site_id, point_ids, code)

    create_readings()
    req("POST", "/validation/run")
    req("POST", "/reports/rebuild")
    req("POST", "/alerts/rules", {"threshold_kwh": 700, "severity": "high"})
    req("POST", "/alerts/run")
    print("city grid seed complete")


if __name__ == "__main__":
    main()
