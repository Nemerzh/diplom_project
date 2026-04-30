import json
import urllib.parse
import urllib.request
from datetime import datetime

PROM = "http://localhost:9090"
OUT = "metrics_snapshot.json"

QUERIES = {
    "rps": "sum(rate(http_requests_total[1m]))",
    "p95_latency": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
    "received_readings_total": "received_readings_total",
    "validated_readings_total": "validated_readings_total",
    "alerts_generated_total": "alerts_generated_total"
}


def query(expr: str):
    qs = urllib.parse.urlencode({"query": expr})
    with urllib.request.urlopen(f"{PROM}/api/v1/query?{qs}", timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    data = {"timestamp": datetime.utcnow().isoformat(), "queries": {}}
    for k, q in QUERIES.items():
        data["queries"][k] = query(q)
    with open(OUT, "w", encoding="utf-8") as fp:
        json.dump(data, fp, indent=2)
    print(f"written {OUT}")


if __name__ == "__main__":
    main()
