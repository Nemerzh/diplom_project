#!/usr/bin/env bash
# Експеримент 3: rolling update.
# Замірюємо тривалість повного rolling-оновлення сервісу:
#   • Swarm: `docker service update --force` чекає, поки всі репліки перейдуть у Running на новій версії.
#   • K8s:   `kubectl rollout restart` + `kubectl rollout status` чекає Available на новій ReplicaSet.
#
# Використання:
#   experiments/rolling_update.sh --platform=swarm --service=backend
#   experiments/rolling_update.sh --platform=kind  --service=backend
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$HERE/lib/common.sh"

parse_kv_args "$@"
PLATFORM="$(require_arg platform)"
SERVICE="$(require_arg service)"
TIMEOUT_S="$(arg timeout "$DEFAULT_TIMEOUT_S")"
TIMEOUT_MS=$(( TIMEOUT_S * 1000 ))

case "$PLATFORM" in
  swarm)
    R0="$(swarm_running_count "$SERVICE")"
    log "Swarm rolling update ${SWARM_STACK}_${SERVICE} (replicas=${R0})"

    START_MS="$(now_ms)"
    # `--force` без зміни образу: перестворить усі задачі за поточним update_config (parallelism+delay).
    # `--detach=true` щоб клієнт повернув керування одразу — час виміряємо самі polling-ом UpdateStatus.
    swarm_docker service update --force --detach=true "${SWARM_STACK}_${SERVICE}" >/dev/null
    log "service update --force відправлено"

    T_DONE=""
    while :; do
      EL_MS=$(( $(now_ms) - START_MS ))
      STATE="$(swarm_docker service inspect --format '{{.UpdateStatus.State}}' "${SWARM_STACK}_${SERVICE}" || echo unknown)"
      if [ "$STATE" = "completed" ]; then
        T_DONE="$EL_MS"
        log "UpdateStatus.State=completed за ${EL_MS} мс"
        break
      fi
      [ "$EL_MS" -ge "$TIMEOUT_MS" ] && { warn "timeout (state=${STATE})"; break; }
      sleep "$POLL_INTERVAL_S"
    done

    csv_append "swarm" "rolling_update" "$SERVICE" "$R0" "$R0" \
      "0" "" "" "${T_DONE:-}" "service update --force"
    echo "platform=swarm scenario=rolling_update service=$SERVICE done_ms=${T_DONE:-NA}"
    ;;

  kind)
    R0="$(k8s_deploy_replicas_spec "$SERVICE")"
    log "K8s rolling restart deploy/${SERVICE} (replicas=${R0})"

    START_MS="$(now_ms)"
    k rollout restart "deploy/${SERVICE}" >/dev/null
    log "kubectl rollout restart відправлено"

    # Чекаємо завершення rollout. Не використовуємо kubectl rollout status (блокучий, важко зняти),
    # а poll-имо .status.observedGeneration vs .metadata.generation і readyReplicas.
    T_DONE=""
    while :; do
      EL_MS=$(( $(now_ms) - START_MS ))
      GEN="$(k get deploy "$SERVICE" -o jsonpath='{.metadata.generation}')"
      OBS="$(k get deploy "$SERVICE" -o jsonpath='{.status.observedGeneration}')"
      READY="$(k8s_deploy_replicas_ready "$SERVICE")"
      UPDATED="$(k get deploy "$SERVICE" -o jsonpath='{.status.updatedReplicas}' 2>/dev/null || echo 0)"
      [ -z "$UPDATED" ] && UPDATED=0
      if [ "$GEN" = "$OBS" ] && [ "$READY" = "$R0" ] && [ "$UPDATED" = "$R0" ]; then
        T_DONE="$EL_MS"
        log "rollout завершено за ${EL_MS} мс (gen=$GEN ready=$READY updated=$UPDATED)"
        break
      fi
      [ "$EL_MS" -ge "$TIMEOUT_MS" ] && { warn "timeout (gen=$GEN obs=$OBS ready=$READY updated=$UPDATED)"; break; }
      sleep "$POLL_INTERVAL_S"
    done

    csv_append "kind" "rolling_update" "$SERVICE" "$R0" "$R0" \
      "0" "" "" "${T_DONE:-}" "rollout restart"
    echo "platform=kind scenario=rolling_update service=$SERVICE done_ms=${T_DONE:-NA}"
    ;;

  *) die "platform має бути swarm|kind, отримав '$PLATFORM'";;
esac
