#!/usr/bin/env bash
# Симетричний до hpa_load (kind) HTTP-лоад на backend у Docker Swarm.
# У Swarm немає вбудованого HPA — тому замість currentReplicas трекаємо
# кількість Running-задач сервісу (зазвичай стабільна, якщо не робити service scale).
#
# Використання:
#   experiments/swarm_load.sh [--service=backend] [--concurrency=20] [--duration=120]
#     [--url=http://NODE1_IP/sites] [--quiet-simulator=1]
#
# URL: на VM зазвичай через proxy стеку (порт 80). Передай свій:
#   SWARM_LOAD_URL=http://192.168.x.x/sites experiments/swarm_load.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$HERE/lib/common.sh"

parse_kv_args "$@"
SERVICE="$(arg service backend)"
CONCURRENCY="$(arg concurrency 20)"
DURATION_S="$(arg duration 120)"
URL_CLI="$(arg url "")"
if [ -n "$URL_CLI" ]; then
  URL="$URL_CLI"
elif [ -n "${SWARM_LOAD_URL:-}" ]; then
  URL="$SWARM_LOAD_URL"
else
  die "Задай адресу backend для лоаду: SWARM_LOAD_URL=http://<manager-ip>/sites або --url=http://... (через nginx proxy стеку порт 80)"
fi

# Типові помилки вручну: подвійний http:// або // у шляху
case "$URL" in
  http://http://*|https://http://*|http://https://*)
    URL="${URL#http://}"
    URL="${URL#https://}"
    URL="${URL#http://}"
    URL="http://${URL}"
    ;;
esac
# Згортаємо лише подвійний слеш у шляху (не чіпаємо "http://")
URL="$(printf '%s' "$URL" | sed -E 's|^([a-zA-Z]+://[^/]+)//+|\1/|')"

QUIET_SIM="$(arg quiet_simulator 1)"

log "=== Swarm HTTP load: service=$SERVICE concurrency=$CONCURRENCY duration=${DURATION_S}s url=$URL ==="

SIM_PAUSED=0
restore_simulator_swarm() {
  if [ "$SIM_PAUSED" = "1" ]; then
    log "Відновлюю simulator → 1 репліку"
    swarm_docker service scale "${SWARM_STACK}_simulator=1" >/dev/null 2>&1 || true
    SIM_PAUSED=0
  fi
}

if [ "$QUIET_SIM" = "1" ]; then
  if swarm_docker service ls --format '{{.Name}}' | grep -qx "${SWARM_STACK}_simulator"; then
    log "Пауза simulator (як у hpa_load для чистішого лоаду на backend)..."
    swarm_docker service scale "${SWARM_STACK}_simulator=0" >/dev/null 2>&1 || true
    SIM_PAUSED=1
  fi
fi

replicas_running() {
  swarm_running_count "$SERVICE"
}

INIT_R="$(replicas_running)"
log "Running реплік $SERVICE на старті: $INIT_R"

LOAD_FLAG="$(mktemp -t swarm_load_flag.XXXXXX)"
LOAD_PIDS=()
spawn_load() {
  local i
  for i in $(seq 1 "$CONCURRENCY"); do
    (
      while [ -f "$LOAD_FLAG" ]; do
        curl -s --max-time 5 -o /dev/null "$URL" 2>/dev/null || true
      done
    ) &
    LOAD_PIDS+=($!)
  done
}

stop_load() {
  rm -f "$LOAD_FLAG" 2>/dev/null || true
  if [ ${#LOAD_PIDS[@]} -gt 0 ]; then
    kill "${LOAD_PIDS[@]}" 2>/dev/null || true
    wait "${LOAD_PIDS[@]}" 2>/dev/null || true
  fi
}

cleanup_all() {
  stop_load
  restore_simulator_swarm
}
trap 'cleanup_all' EXIT INT TERM

START_MS="$(now_ms)"
spawn_load
log "Лоад запущено (${#LOAD_PIDS[@]} процесів curl)"

MAX_R="$INIT_R"
MIN_R="$INIT_R"
LAST_R="$INIT_R"
T_FIRST_CHANGE_MS=""
LOAD_END_MS=$(( START_MS + DURATION_S * 1000 ))

while :; do
  NOW="$(now_ms)"
  EL=$(( NOW - START_MS ))
  R="$(replicas_running)"
  [ "$R" -gt "$MAX_R" ] && MAX_R="$R"
  [ "$R" -lt "$MIN_R" ] && MIN_R="$R"
  if [ "$R" != "$LAST_R" ]; then
    log "running: $LAST_R → $R за ${EL} мс"
    [ -z "$T_FIRST_CHANGE_MS" ] && T_FIRST_CHANGE_MS="$EL"
    LAST_R="$R"
  fi
  [ "$NOW" -ge "$LOAD_END_MS" ] && break
  sleep 1
done

stop_load
LOAD_STOP_MS=$(( $(now_ms) - START_MS ))
FINAL_R="$(replicas_running)"
log "Лоад зупинено за ${LOAD_STOP_MS} мс. running зараз: $FINAL_R (min під лоадом=$MIN_R max=$MAX_R)"

restore_simulator_swarm

NOTES="swarm_load sim_paused=$QUIET_SIM min_run=$MIN_R max_run=$MAX_R url=$(printf '%s' "$URL" | tr ',' ';')"
# Колонки як у hpa_load: to_n = max running під навантаженням; t_first_ready = перша зміна кількості задач
csv_append "swarm" "swarm_load" "$SERVICE" "$INIT_R" "$MAX_R" \
  0 "${T_FIRST_CHANGE_MS:-}" "" "${LOAD_STOP_MS}" "$NOTES"

echo "platform=swarm scenario=swarm_load service=$SERVICE init=$INIT_R max_running=$MAX_R t_first_replica_change_ms=${T_FIRST_CHANGE_MS:-NA} load_ms=$LOAD_STOP_MS"
