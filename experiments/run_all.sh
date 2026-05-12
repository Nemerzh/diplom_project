#!/usr/bin/env bash
# Прогоняє всі три експерименти (scale → failover → rolling_update) для однієї платформи.
# Між кроками вирівнює сервіс назад на BASE_REPLICAS.
#
# Використання:
#   experiments/run_all.sh --platform=swarm --service=backend [--base=2 --peak=5]
#   experiments/run_all.sh --platform=kind  --service=backend [--base=2 --peak=5]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$HERE/lib/common.sh"

parse_kv_args "$@"
PLATFORM="$(require_arg platform)"
SERVICE="$(require_arg service)"
BASE="$(arg base 2)"
PEAK="$(arg peak 5)"

log "=== run_all platform=$PLATFORM service=$SERVICE base=$BASE peak=$PEAK ==="

log ">>> 1/4: scale up ${BASE} → ${PEAK}"
"$HERE/scale.sh" --platform="$PLATFORM" --service="$SERVICE" --to="$PEAK"

log ">>> 2/4: scale down ${PEAK} → ${BASE}"
"$HERE/scale.sh" --platform="$PLATFORM" --service="$SERVICE" --to="$BASE"

log ">>> 3/4: failover (kill 1)"
"$HERE/failover.sh" --platform="$PLATFORM" --service="$SERVICE"

log ">>> 4/4: rolling update"
"$HERE/rolling_update.sh" --platform="$PLATFORM" --service="$SERVICE"

# HPA-сценарій є вбудованим лише у Kubernetes — для Swarm пропускаємо (це частина порівняння у дипломі).
if [ "$PLATFORM" = "kind" ] && [ "${RUN_HPA:-1}" = "1" ]; then
  log ">>> 5/5: HPA load (kind only)"
  "$HERE/hpa_load.sh" --platform=kind --service="$SERVICE" \
    --concurrency="${HPA_CONCURRENCY:-20}" \
    --duration="${HPA_DURATION:-120}" \
    --url="${HPA_URL:-http://localhost:8000/sites}" \
    --cooldown="${HPA_COOLDOWN:-600}" \
    --quiet-simulator="${HPA_QUIET_SIM:-1}"
fi

log "Готово. Агрегат: $CSV_FILE | окремі прогони: $EXPERIMENTS_RUN_DIR/"
