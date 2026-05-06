#!/usr/bin/env bash
# Експеримент 2: відмова контейнера / поду.
# Вбиваємо одну Running-репліку і вимірюємо, скільки часу оркестратору треба, щоб відновити кількість.
#
# Використання:
#   experiments/failover.sh --platform=swarm --service=backend
#   experiments/failover.sh --platform=kind  --service=backend
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
    [ "$R0" -lt 1 ] && die "У сервісу '${SWARM_STACK}_${SERVICE}' нуль Running-задач — нема що валити"

    PAIR="$(swarm_pick_one_task_node "$SERVICE")"
    [ -z "$PAIR" ] && die "Не знайшов жодної Running-задачі"
    TASK_ID="${PAIR%% *}"
    NODE="${PAIR##* }"
    log "Вбиваю задачу ${TASK_ID} на ноді ${NODE} (target replicas=${R0})"

    # Знаходимо container_id за task-id на конкретній ноді swarm.
    CID="$(multipass exec "$NODE" -- docker ps --filter "label=com.docker.swarm.task.id=${TASK_ID}" --format '{{.ID}}' | tr -d '\r' | head -n1)"
    [ -z "$CID" ] && die "Не знайшов контейнер для task=${TASK_ID} на ${NODE}"

    # LAST=R0 *перед* kill, з тих самих міркувань, що і в k8s-гілці.
    T_DROP=""; T_BACK=""
    LAST="$R0"
    START_MS="$(now_ms)"
    multipass exec "$NODE" -- docker kill "$CID" >/dev/null
    log "kill відправлено: container=${CID}"

    while :; do
      EL_MS=$(( $(now_ms) - START_MS ))
      CUR="$(swarm_running_count "$SERVICE")"
      if [ "$CUR" != "$LAST" ]; then
        log "running: ${LAST} → ${CUR} за ${EL_MS} мс"
        if [ -z "$T_DROP" ] && [ "$CUR" -lt "$R0" ]; then T_DROP="$EL_MS"; fi
        LAST="$CUR"
      fi
      if [ "$CUR" = "$R0" ] && [ -n "$T_DROP" ]; then
        T_BACK="$EL_MS"
        break
      fi
      [ "$EL_MS" -ge "$TIMEOUT_MS" ] && { warn "timeout після ${EL_MS} мс"; break; }
      sleep "$POLL_INTERVAL_S"
    done

    csv_append "swarm" "failover" "$SERVICE" "$R0" "$R0" \
      "0" "${T_DROP:-}" "${T_BACK:-}" "${T_BACK:-}" \
      "killed task=${TASK_ID} on ${NODE}"
    echo "platform=swarm scenario=failover service=$SERVICE drop_ms=${T_DROP:-NA} recovered_ms=${T_BACK:-NA}"
    ;;

  kind)
    R0="$(k8s_deploy_replicas_spec "$SERVICE")"
    POD="$(k8s_pick_one_pod "$SERVICE")"
    [ -z "$POD" ] && die "Немає Running pod для app=${SERVICE}"
    log "Видаляю pod ${POD} (target replicas=${R0})"

    # ВАЖЛИВО: LAST=R0 фіксуємо *перед* delete, інакше при --grace-period=0 --force
    # ready може впасти до polling-у, перехід 5→4 загубиться, і умова виходу не спрацює.
    T_DROP=""; T_BACK=""
    LAST="$R0"
    START_MS="$(now_ms)"
    k delete pod "$POD" --grace-period=0 --force >/dev/null 2>&1 || true
    log "kubectl delete pod відправлено"

    while :; do
      EL_MS=$(( $(now_ms) - START_MS ))
      CUR="$(k8s_deploy_replicas_ready "$SERVICE")"
      if [ "$CUR" != "$LAST" ]; then
        log "ready: ${LAST} → ${CUR} за ${EL_MS} мс"
        if [ -z "$T_DROP" ] && [ "$CUR" -lt "$R0" ]; then T_DROP="$EL_MS"; fi
        LAST="$CUR"
      fi
      if [ "$CUR" = "$R0" ] && [ -n "$T_DROP" ]; then
        T_BACK="$EL_MS"
        break
      fi
      [ "$EL_MS" -ge "$TIMEOUT_MS" ] && { warn "timeout після ${EL_MS} мс"; break; }
      sleep "$POLL_INTERVAL_S"
    done

    csv_append "kind" "failover" "$SERVICE" "$R0" "$R0" \
      "0" "${T_DROP:-}" "${T_BACK:-}" "${T_BACK:-}" \
      "deleted pod=${POD}"
    echo "platform=kind scenario=failover service=$SERVICE drop_ms=${T_DROP:-NA} recovered_ms=${T_BACK:-NA}"
    ;;

  *) die "platform має бути swarm|kind, отримав '$PLATFORM'";;
esac
