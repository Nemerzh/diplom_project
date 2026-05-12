#!/usr/bin/env bash
# Скидання PostgreSQL для демо-БД energy (видалення всіх таблиць у public).
#
# Kind: kubectl exec у deploy/postgres, потім Job міграцій (можна SKIP_MIGRATE=1).
# Swarm: docker exec у контейнер postgres на manager VM, потім --force сервісу backend (alembic при старті).
#
# Використання:
#   bash infra/local/reset-energy-db.sh kind
#   bash infra/local/reset-energy-db.sh swarm
#
# Змінні: KIND_CLUSTER_NAME, SWARM_MANAGER, SWARM_STACK, SKIP_MIGRATE
set -euo pipefail

# Скрипт лежить у infra/local → два рівні вгору до кореня репо.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLATFORM="${1:-}"
if [ -z "$PLATFORM" ] || { [ "$PLATFORM" != "kind" ] && [ "$PLATFORM" != "swarm" ]; }; then
  echo "usage: $0 kind|swarm" >&2
  exit 1
fi

SQL_RESET=$'DROP SCHEMA public CASCADE;\nCREATE SCHEMA public AUTHORIZATION energy;\n'

reset_kind() {
  local ctx="kind-${KIND_CLUSTER_NAME:-energy}"
  echo "[kind] DROP/CREATE schema public у energy (namespace energy)..."
  kubectl --context "$ctx" -n energy exec deploy/postgres -- \
    psql -U energy -d energy -v ON_ERROR_STOP=1 -c "$SQL_RESET"

  if [ "${SKIP_MIGRATE:-0}" = "1" ]; then
    echo "[kind] SKIP_MIGRATE=1 — пропускаю backend-migrate-once Job"
    return 0
  fi
  echo "[kind] Міграції: backend-migrate-once..."
  kubectl --context "$ctx" delete job backend-migrate-once -n energy --ignore-not-found
  kubectl --context "$ctx" apply -f "$ROOT/deploy/k8s/backend-migrate-job.yaml"
  kubectl --context "$ctx" wait --for=condition=complete job/backend-migrate-once -n energy --timeout=300s
}

reset_swarm() {
  local mgr="${SWARM_MANAGER:-node-1}"
  local stack="${SWARM_STACK:-energy}"
  echo "[swarm] Шукаю контейнер ${stack}_postgres на $mgr..."
  local cid
  cid="$(multipass exec "$mgr" -- bash -lc "docker ps -qf name=${stack}_postgres | head -1")"
  if [ -z "$cid" ]; then
    echo "немає running-контейнера '${stack}_postgres' — перевір stack і multipass ssh $mgr" >&2
    exit 1
  fi
  echo "[swarm] DROP/CREATE schema public (container $cid)..."
  multipass exec "$mgr" -- docker exec "$cid" \
    psql -U energy -d energy -v ON_ERROR_STOP=1 -c "$SQL_RESET"

  if [ "${SKIP_BACKEND_RESTART:-0}" = "1" ]; then
    echo "[swarm] SKIP_BACKEND_RESTART=1 — не перезапускаю backend"
    return 0
  fi
  echo "[swarm] Перезапуск ${stack}_backend (alembic при старті)..."
  multipass exec "$mgr" -- docker service update --force "${stack}_backend"
}

case "$PLATFORM" in
  kind)  reset_kind ;;
  swarm) reset_swarm ;;
esac

echo "Готово."
