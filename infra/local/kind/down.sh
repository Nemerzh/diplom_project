#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLUSTER_NAME="${KIND_CLUSTER_NAME:-energy}"
CTX="kind-${CLUSTER_NAME}"

BACKUP_DIR="$ROOT/infra/local/out"
BACKUP_FILE="${KIND_PG_BACKUP_FILE:-$BACKUP_DIR/kind-pg-backup.sql}"

dump_postgres() {
  if ! kubectl --context "$CTX" -n energy get deploy postgres >/dev/null 2>&1; then
    echo "Postgres deployment не знайдено — пропускаю дамп"
    return 0
  fi
  local phase
  phase="$(kubectl --context "$CTX" -n energy get pod -l app=postgres \
    -o jsonpath='{.items[0].status.phase}' 2>/dev/null || true)"
  if [ "$phase" != "Running" ]; then
    echo "Postgres pod не в стані Running ($phase) — пропускаю дамп"
    return 0
  fi

  mkdir -p "$BACKUP_DIR"
  local tmp="$BACKUP_FILE.tmp"
  echo "pg_dump → $BACKUP_FILE ..."
  if kubectl --context "$CTX" -n energy exec deploy/postgres -- \
       pg_dump -U energy --clean --if-exists --no-owner --no-privileges energy \
       > "$tmp"; then
    mv "$tmp" "$BACKUP_FILE"
    echo "Backup збережено ($(wc -c <"$BACKUP_FILE") bytes)"
  else
    rm -f "$tmp"
    echo "WARN: pg_dump впав — лишаю попередній бекап (якщо був)"
  fi
}

if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  if [ "${KIND_SKIP_BACKUP:-0}" = "1" ]; then
    echo "KIND_SKIP_BACKUP=1 — пропускаю pg_dump"
  else
    dump_postgres || true
  fi
  kind delete cluster --name "$CLUSTER_NAME"
else
  echo "Cluster '${CLUSTER_NAME}' not present"
fi
