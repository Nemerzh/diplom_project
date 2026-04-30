import csv
import datetime as dt
import json
import random
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "http://localhost:8000"
REQUESTS = 300
CONCURRENCY = 20


def _request(method: str, path: str, payload: dict | None = None, timeout: int = 10):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
        return resp.status, (json.loads(body) if body else {})


def send_one(meter_id: int):
    payload = {
        "meter_id": meter_id,
        "ts": dt.datetime.utcnow().isoformat(),
        "value_kwh": round(random.uniform(1, 30), 3),
        "source": "load",
    }
    t0 = time.perf_counter()
    status, _ = _request("POST", "/readings", payload, timeout=10)
    ms = (time.perf_counter() - t0) * 1000
    return status, ms


def main():
    _, meters = _request("GET", "/meters", timeout=10)
    meter_ids = [m["id"] for m in meters] or [1]
    results = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = [ex.submit(send_one, random.choice(meter_ids)) for _ in range(REQUESTS)]
        for f in as_completed(futures):
            results.append(f.result())
    ok = sum(1 for code, _ in results if code < 400)
    avg = sum(ms for _, ms in results) / len(results)
    p95 = sorted(ms for _, ms in results)[int(0.95 * len(results)) - 1]
    with open("load_test_results.csv", "w", newline="", encoding="utf-8") as fp:
        writer = csv.writer(fp)
        writer.writerow(["status_code", "latency_ms"])
        writer.writerows(results)
    print(f"ok={ok}/{len(results)} avg_ms={avg:.2f} p95_ms={p95:.2f}")


if __name__ == "__main__":
    main()
