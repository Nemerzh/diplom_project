# Energy Metering Platform MVP

MVP стенд для дипломного порівняння Docker Swarm vs Kubernetes на прикладі обліку електроенергії.

## Components

- `services/backend` - FastAPI backend (registry/readings/validation/reports/alerts/system/topology).
- `services/frontend` - React + Vite dashboard.
- `services/simulator` - сценарний генератор показів (v2: smoothing/events/retries).
- `monitoring` - Prometheus + Grafana provisioning.
- `deploy/compose` - local docker compose.
- `deploy/swarm` - docker stack file.
- `deploy/k8s` - kubernetes manifests.
- `scripts` - seed/load/failover/metrics scripts.

## Local run (Docker Compose)

1. Build and run:
   - `docker compose -f deploy/compose/docker-compose.yml up -d --build`
2. Run migrations:
   - `docker compose -f deploy/compose/docker-compose.yml run --rm backend-migrate`
3. Seed data:
   - `python scripts/seed_data.py`
4. Open:
   - API docs: `http://localhost:8000/docs`
   - UI: `http://localhost:8081`
   - Simulator API: `http://localhost:8010/docs`
   - Prometheus: `http://localhost:9090`
   - Grafana: `http://localhost:3000` (`admin/admin`)

## Simulator v2

Симулятор читає конфіг із `services/simulator/scenario.yaml` і підтримує:

- добові шаблони навантаження за типом/роллю лічильника;
- згладжування потужності (`smoothing_alpha`);
- події `offline` та `spike`;
- ретраї на `POST /readings` з backoff;
- override на конкретний лічильник (`meter_overrides`).

### Simulator endpoints

- Start: `curl -X POST http://localhost:8010/simulator/start`
- Stop: `curl -X POST http://localhost:8010/simulator/stop`
- Status: `curl http://localhost:8010/simulator/status`
- Reload config: `curl -X POST http://localhost:8010/simulator/reload-config`

### Simulator environment variables

- `API_URL` - backend URL (default `http://backend:8000`)
- `METER_IDS` - optional CSV whitelist (example: `1,2,3`)
- `SIM_CONFIG_PATH` - path to scenario yaml in container
- `SIM_AUTOSTART` - `1|true|yes` for auto-run on startup

Backward-compatible overrides (if set) still work:

- `INTERVAL_SECONDS`
- `METERS_REFRESH_SECONDS`
- `SIM_PROFILE` (`normal|peak|critical|offline`)
- `SIM_MULTIPLIER`

### Simulator metrics

- `simulated_readings_total`
- `simulator_post_errors_total`
- `simulator_post_retries_total`

## Basic experiment flow

1. `python scripts/load_test.py`
2. `python scripts/collect_metrics.py`
3. Start simulator: `curl -X POST http://localhost:8010/simulator/start`
4. Run backend pipeline:
   - `curl -X POST http://localhost:8000/validation/run`
   - `curl -X POST http://localhost:8000/reports/rebuild`
   - `curl -X POST http://localhost:8000/alerts/run`
