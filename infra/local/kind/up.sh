#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLUSTER_NAME="${KIND_CLUSTER_NAME:-energy}"
CONFIG="$(dirname "${BASH_SOURCE[0]}")/cluster.yaml"
CTX="kind-${CLUSTER_NAME}"

BACKUP_DIR="$ROOT/infra/local/out"
BACKUP_FILE="${KIND_PG_BACKUP_FILE:-$BACKUP_DIR/kind-pg-backup.sql}"
RESTORE_PROBE_TABLE="${KIND_RESTORE_PROBE_TABLE:-meters}"

run_migrate_job() {
  kubectl --context "$CTX" delete job backend-migrate-once -n energy --ignore-not-found
  kubectl --context "$CTX" apply -f "$ROOT/deploy/k8s/backend-migrate-job.yaml"
  kubectl --context "$CTX" wait --for=condition=complete job/backend-migrate-once -n energy --timeout=300s
}

maybe_restore_postgres() {
  if [ "${KIND_RESTORE:-1}" = "0" ]; then
    echo "KIND_RESTORE=0 — пропускаю restore"
    return 0
  fi
  if [ ! -f "$BACKUP_FILE" ]; then
    echo "Бекапу немає ($BACKUP_FILE) — пропускаю restore"
    return 0
  fi

  local table_exists count
  table_exists="$(kubectl --context "$CTX" -n energy exec deploy/postgres -- \
    psql -U energy -d energy -tAc \
    "SELECT to_regclass('public.${RESTORE_PROBE_TABLE}') IS NOT NULL" 2>/dev/null \
    | tr -d '[:space:]' || true)"
  if [ "$table_exists" != "t" ]; then
    echo "Таблиця ${RESTORE_PROBE_TABLE} не знайдена після міграції — пропускаю restore"
    return 0
  fi

  count="$(kubectl --context "$CTX" -n energy exec deploy/postgres -- \
    psql -U energy -d energy -tAc "SELECT count(*) FROM ${RESTORE_PROBE_TABLE}" 2>/dev/null \
    | tr -d '[:space:]' || echo 0)"
  [ -z "$count" ] && count=0

  if [ "$count" != "0" ] && [ "${KIND_RESTORE_FORCE:-0}" != "1" ]; then
    echo "У ${RESTORE_PROBE_TABLE} вже є дані ($count рядків) — restore пропущено (KIND_RESTORE_FORCE=1 щоб усе одно відновити)"
    return 0
  fi

  echo "Restore postgres з $BACKUP_FILE ..."
  kubectl --context "$CTX" -n energy exec -i deploy/postgres -- \
    psql -U energy -d energy -v ON_ERROR_STOP=0 < "$BACKUP_FILE"

  echo "Повторний alembic upgrade head (на випадок, якщо бекап старший за код)..."
  run_migrate_job
}

if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "Cluster '${CLUSTER_NAME}' already exists"
else
  kind create cluster --name "$CLUSTER_NAME" --config "$CONFIG"
fi

echo "Building images (frontend → API http://localhost:8000 для браузера)..."
docker build -t energy-backend:latest "$ROOT/services/backend"
docker build -t energy-frontend:latest --build-arg VITE_API_BASE_URL=http://localhost:8000 "$ROOT/services/frontend"
docker build -t energy-simulator:latest "$ROOT/services/simulator"

kind load docker-image energy-backend:latest --name "$CLUSTER_NAME"
kind load docker-image energy-frontend:latest --name "$CLUSTER_NAME"
kind load docker-image energy-simulator:latest --name "$CLUSTER_NAME"

echo "Applying manifests..."
kubectl --context "$CTX" apply -f "$ROOT/deploy/k8s/energy-platform.yaml"

echo "Scale backend to 0 until migrations complete..."
kubectl --context "$CTX" scale deployment/backend -n energy --replicas=0

echo "Waiting for Postgres..."
kubectl --context "$CTX" wait --for=condition=ready pod -l app=postgres -n energy --timeout=180s

run_migrate_job

maybe_restore_postgres

echo "Patching Services to NodePort (kind port mapping)..."
kubectl --context "$CTX" patch svc backend -n energy --type=merge -p \
  '{"spec":{"type":"NodePort","ports":[{"port":8000,"targetPort":8000,"nodePort":30080}]}}'
kubectl --context "$CTX" patch svc frontend -n energy --type=merge -p \
  '{"spec":{"type":"NodePort","ports":[{"port":80,"targetPort":80,"nodePort":30081}]}}'

kubectl --context "$CTX" scale deployment/backend -n energy --replicas=2
kubectl --context "$CTX" rollout status deployment/backend -n energy --timeout=180s
kubectl --context "$CTX" rollout status deployment/frontend -n energy --timeout=180s

echo "Simulator: ConfigMap зі сценарію + Deployment..."
kubectl --context "$CTX" create configmap simulator-scenario -n energy \
  --from-file=scenario.yaml="$ROOT/services/simulator/scenario.yaml" \
  --dry-run=client -o yaml | kubectl --context "$CTX" apply -f -
kubectl --context "$CTX" apply -f "$ROOT/deploy/k8s/simulator.yaml"
kubectl --context "$CTX" rollout status deployment/simulator -n energy --timeout=120s

echo "NetworkPolicies (як documentation якщо CNI без enforcement)..."
kubectl --context "$CTX" apply -f "$ROOT/deploy/k8s/network-policies.yaml"

if [ "${KIND_SKIP_MONITORING:-0}" != "1" ]; then
  echo "Monitoring: Prometheus + Grafana + node-exporter + cAdvisor + kube-state-metrics..."
  kubectl --context "$CTX" apply -f "$ROOT/deploy/k8s/monitoring.yaml"

  # JSON дашбордів вантажимо як ConfigMap (без дублювання в YAML).
  kubectl --context "$CTX" create configmap grafana-dashboards-json -n monitoring \
    --from-file="$ROOT/monitoring/grafana/dashboards" \
    --dry-run=client -o yaml | kubectl --context "$CTX" apply -f -
  kubectl --context "$CTX" rollout restart deployment/grafana -n monitoring >/dev/null 2>&1 || true

  kubectl --context "$CTX" rollout status deployment/prometheus -n monitoring --timeout=180s
  kubectl --context "$CTX" rollout status deployment/grafana -n monitoring --timeout=180s
  kubectl --context "$CTX" rollout status deployment/kube-state-metrics -n monitoring --timeout=180s
  kubectl --context "$CTX" rollout status daemonset/node-exporter -n monitoring --timeout=180s
  kubectl --context "$CTX" rollout status daemonset/cadvisor -n monitoring --timeout=180s
fi

kubectl --context "$CTX" get pods,svc -n energy
echo
echo "Backend:    http://localhost:8000/health"
echo "Frontend:   http://localhost:8081"
echo "Prometheus: http://localhost:9090"
echo "Grafana:    http://localhost:3000  (admin/admin)"
echo "Ingress energy.local ігнорується без ingress-controller; використовуйте порти вище."
[ -f "$BACKUP_FILE" ] && echo "Бекап: $BACKUP_FILE ($(wc -c <"$BACKUP_FILE") bytes)" || echo "Бекап: ще не створено (зробить kind-down)"
