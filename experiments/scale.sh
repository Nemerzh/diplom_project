#!/usr/bin/env bash
# Експеримент 1: масштабування сервісу.
# Замірюємо: t_request (момент запиту scale), t_first_ready (поява першої «нової» готової репліки),
# t_all_ready (досягнення цільової кількості готових реплік).
#
# Використання:
#   experiments/scale.sh --platform=swarm --service=backend --to=5
#   experiments/scale.sh --platform=kind  --service=backend --to=5
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$HERE/lib/common.sh"

parse_kv_args "$@"
PLATFORM="$(require_arg platform)"
SERVICE="$(require_arg service)"
TARGET="$(require_arg to)"
TIMEOUT_S="$(arg timeout "$DEFAULT_TIMEOUT_S")"
TIMEOUT_MS=$(( TIMEOUT_S * 1000 ))

case "$PLATFORM" in
  swarm)
    log "Swarm: scale ${SWARM_STACK}_${SERVICE} → ${TARGET}"
    FROM="$(swarm_running_count "$SERVICE")"
    log "Поточна кількість Running реплік: ${FROM}"

    T_REQUEST_MS=0
    START_MS="$(now_ms)"
    # `--detach=true` — клієнт повертає керування одразу після прийняття команди оркестратором,
    # інакше polling-цикл нижче не побачить проміжних кроків (1→2→3...).
    swarm_docker service update --detach=true --replicas="$TARGET" "${SWARM_STACK}_${SERVICE}" >/dev/null
    REQ_DONE_MS=$(( $(now_ms) - START_MS ))
    log "scale-команда прийнята за ${REQ_DONE_MS} мс"

    T_FIRST_READY=""
    T_ALL_READY=""
    LAST="$FROM"
    while :; do
      EL_MS=$(( $(now_ms) - START_MS ))
      CUR="$(swarm_running_count "$SERVICE")"
      if [ "$CUR" != "$LAST" ]; then
        log "running: ${LAST} → ${CUR} за ${EL_MS} мс"
        if [ -z "$T_FIRST_READY" ]; then T_FIRST_READY="$EL_MS"; fi
        LAST="$CUR"
      fi
      if [ "$CUR" = "$TARGET" ]; then
        T_ALL_READY="$EL_MS"
        break
      fi
      [ "$EL_MS" -ge "$TIMEOUT_MS" ] && { warn "timeout після ${EL_MS} мс"; break; }
      sleep "$POLL_INTERVAL_S"
    done
    ;;

  kind)
    log "Kind: scale deploy/${SERVICE} → ${TARGET}"
    FROM="$(k8s_deploy_replicas_ready "$SERVICE")"
    log "Поточна кількість ready реплік: ${FROM}"

    T_REQUEST_MS=0
    START_MS="$(now_ms)"
    k scale "deploy/${SERVICE}" --replicas="$TARGET" >/dev/null
    REQ_DONE_MS=$(( $(now_ms) - START_MS ))
    log "kubectl scale відправлено за ${REQ_DONE_MS} мс"

    T_FIRST_READY=""
    T_ALL_READY=""
    LAST="$FROM"
    while :; do
      EL_MS=$(( $(now_ms) - START_MS ))
      CUR="$(k8s_deploy_replicas_ready "$SERVICE")"
      if [ "$CUR" != "$LAST" ]; then
        log "ready: ${LAST} → ${CUR} за ${EL_MS} мс"
        if [ -z "$T_FIRST_READY" ]; then T_FIRST_READY="$EL_MS"; fi
        LAST="$CUR"
      fi
      if [ "$CUR" = "$TARGET" ]; then
        T_ALL_READY="$EL_MS"
        break
      fi
      [ "$EL_MS" -ge "$TIMEOUT_MS" ] && { warn "timeout після ${EL_MS} мс"; break; }
      sleep "$POLL_INTERVAL_S"
    done
    ;;

  *) die "platform має бути swarm|kind, отримав '$PLATFORM'";;
esac

csv_append "$PLATFORM" "scale" "$SERVICE" "$FROM" "$TARGET" \
  "$T_REQUEST_MS" "${T_FIRST_READY:-}" "${T_ALL_READY:-}" "${T_ALL_READY:-}" \
  "scale ${FROM}->${TARGET}"

echo "platform=$PLATFORM scenario=scale service=$SERVICE from=$FROM to=$TARGET first_ready_ms=${T_FIRST_READY:-NA} all_ready_ms=${T_ALL_READY:-NA}"
