# Energy Metering Platform MVP

MVP стенд для дипломного порівняння Docker Swarm vs Kubernetes на прикладі обліку електроенергії.

## Components

- `services/backend` - FastAPI backend (registry/readings/validation/reports/alerts/system).
- `services/frontend` - React + Vite dashboard.
- `services/simulator` - smart meter data generator.
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
   - Prometheus: `http://localhost:9090`
   - Grafana: `http://localhost:3000` (`admin/admin`)

## Basic experiment flow

1. `python scripts/load_test.py`
2. `python scripts/collect_metrics.py`
3. Start simulator: `curl -X POST http://localhost:8010/simulator/start`
4. Validate and rebuild:
   - `curl -X POST http://localhost:8000/validation/run`
   - `curl -X POST http://localhost:8000/reports/rebuild`
   - `curl -X POST http://localhost:8000/alerts/run`
