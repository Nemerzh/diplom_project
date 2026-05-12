#!/usr/bin/env bash
# Запуск Job з deploy/k8s/demo-seed-job.yaml (той самий сид, що compose-seed).
# Потрібні: kubectl context kind-energy, образ energy-backend:latest завантажений у kind (make / kind load).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLUSTER_NAME="${KIND_CLUSTER_NAME:-energy}"
CTX="kind-${CLUSTER_NAME}"

echo "Applying demo-network-seed Job (namespace energy)..."
kubectl --context "$CTX" delete job demo-network-seed -n energy --ignore-not-found
kubectl --context "$CTX" apply -f "$ROOT/deploy/k8s/demo-seed-job.yaml"

echo "Waiting for Job complete (до 10 хв)..."
if kubectl --context "$CTX" wait --for=condition=complete "job/demo-network-seed" -n energy --timeout=600s; then
  echo "Logs:"
  kubectl --context "$CTX" logs "job/demo-network-seed" -n energy
  exit 0
fi

echo "Job не завершився успішно — діагностика:" >&2
kubectl --context "$CTX" describe job demo-network-seed -n energy || true
kubectl --context "$CTX" get pods -n energy -l "job-name=demo-network-seed" -o wide || true
for p in $(kubectl --context "$CTX" get pods -n energy -l "job-name=demo-network-seed" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
  echo "--- logs pod $p ---" >&2
  kubectl --context "$CTX" logs -n energy "$p" --all-containers --tail=200 2>&1 || true
done
exit 1
