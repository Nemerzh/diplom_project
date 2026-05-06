#!/usr/bin/env bash
# Демо-секрети для локального стенду (НЕ для продакшену).
set -euo pipefail

POSTGRES_PW="${POSTGRES_PASSWORD:-energy}"
GRAFANA_PW="${GRAFANA_ADMIN_PASSWORD:-admin}"
DATABASE_URL="postgresql+psycopg2://energy:${POSTGRES_PW}@postgres:5432/energy"

if multipass exec node-1 -- docker secret inspect postgres_password >/dev/null 2>&1; then
  echo "[exists] postgres_password"
else
  multipass exec node-1 -- bash -lc "echo -n '${POSTGRES_PW}' | docker secret create postgres_password -"
  echo "[created] postgres_password"
fi

if multipass exec node-1 -- docker secret inspect grafana_admin_password >/dev/null 2>&1; then
  echo "[exists] grafana_admin_password"
else
  multipass exec node-1 -- bash -lc "echo -n '${GRAFANA_PW}' | docker secret create grafana_admin_password -"
  echo "[created] grafana_admin_password"
fi

if multipass exec node-1 -- docker secret inspect backend_database_url >/dev/null 2>&1; then
  echo "[exists] backend_database_url"
else
  multipass exec node-1 -- bash -lc "echo -n '${DATABASE_URL}' | docker secret create backend_database_url -"
  echo "[created] backend_database_url"
fi

multipass exec node-1 -- docker secret ls
