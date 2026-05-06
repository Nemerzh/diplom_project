#!/usr/bin/env bash
# Спільні утиліти для experiments/{scale,failover,rolling_update}.sh.
# Підтримуються дві платформи: swarm (через multipass exec) і kind (через kubectl на хості).
set -euo pipefail

# ───────────────────────── Конфіг (можна перевизначити через ENV) ──────────────
ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
SWARM_MANAGER="${SWARM_MANAGER:-node-1}"
SWARM_STACK="${SWARM_STACK:-energy}"
KIND_CONTEXT="${KIND_CONTEXT:-kind-energy}"
K8S_NAMESPACE="${K8S_NAMESPACE:-energy}"

OUT_DIR="${OUT_DIR:-$ROOT_DIR/infra/local/out}"
CSV_FILE="${EXPERIMENTS_CSV:-$OUT_DIR/experiments.csv}"
POLL_INTERVAL_S="${POLL_INTERVAL_S:-0.2}"
DEFAULT_TIMEOUT_S="${EXPERIMENT_TIMEOUT_S:-300}"

# ───────────────────────── Логування ───────────────────────────────────────────
log()  { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
warn() { printf '[%s] WARN: %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
die()  { printf '[%s] ERROR: %s\n' "$(date '+%H:%M:%S')" "$*" >&2; exit 1; }

# ───────────────────────── Час у мілісекундах ──────────────────────────────────
# Намагаємося скористатись GNU date %N (швидко). Якщо недоступний — python.
_HAS_DATE_NS=""
if [ "$(date +%N 2>/dev/null)" != "%N" ] && [ -n "$(date +%N 2>/dev/null)" ]; then
  _HAS_DATE_NS="1"
fi

now_ms() {
  if [ -n "$_HAS_DATE_NS" ]; then
    echo $(( $(date +%s%N) / 1000000 ))
  else
    python -c 'import time;print(int(time.time()*1000))' 2>/dev/null \
      || python3 -c 'import time;print(int(time.time()*1000))'
  fi
}

# ───────────────────────── CSV-трекер ──────────────────────────────────────────
CSV_HEADER='ts_iso,platform,scenario,service,from_n,to_n,t_request_ms,t_first_ready_ms,t_all_ready_ms,t_done_ms,notes'

csv_init() {
  mkdir -p "$(dirname "$CSV_FILE")"
  if [ ! -f "$CSV_FILE" ]; then
    echo "$CSV_HEADER" > "$CSV_FILE"
  fi
}

# csv_append <platform> <scenario> <service> <from_n> <to_n> <t_request_ms> <t_first_ready_ms> <t_all_ready_ms> <t_done_ms> <notes>
csv_append() {
  csv_init
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "$ts" "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9" "${10}" >> "$CSV_FILE"
}

# ───────────────────────── Парсер аргументів ───────────────────────────────────
# parse_kv_args parses --key=value tokens in $@; populates ARG_<KEY> globals (UPPER, dash→_)
declare -A _ARGS
parse_kv_args() {
  _ARGS=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --*=*)
        local k="${1%%=*}"; local v="${1#*=}"
        k="${k#--}"; k="${k//-/_}"
        _ARGS["$k"]="$v"
        ;;
      *) die "Невідомий аргумент '$1' (очікую --key=value)";;
    esac
    shift
  done
}

arg() {
  local key="$1" default="${2:-}"
  if [ "${_ARGS[$key]+x}" = "x" ]; then
    echo "${_ARGS[$key]}"
  else
    echo "$default"
  fi
}

require_arg() {
  local key="$1"
  if [ -z "${_ARGS[$key]:-}" ]; then
    die "Потрібен --${key//_/-}=..."
  fi
  echo "${_ARGS[$key]}"
}

# ───────────────────────── Swarm helpers (через multipass) ─────────────────────
# Виконуємо `docker ...` на manager-ноді swarm. STDOUT перенаправляємо без зайвого CR (Windows quirk).
swarm_docker() {
  multipass exec "$SWARM_MANAGER" -- docker "$@" | tr -d '\r'
}

swarm_service_replicas() {
  # Повертає "running/desired" (наприклад "2/2", "0/2", "3/3").
  swarm_docker service ls --filter "name=${SWARM_STACK}_${1}" --format '{{.Replicas}}' | head -n1
}

swarm_running_count() {
  # Лічимо задачі сервісу зі станом Running.
  swarm_docker service ps "${SWARM_STACK}_${1}" \
      --filter desired-state=running \
      --format '{{.CurrentState}}' \
    | grep -c '^Running' || true
}

swarm_pick_one_task_node() {
  # Друкує "<container_id> <node>" однієї довільної Running-задачі. Для failover.
  swarm_docker service ps "${SWARM_STACK}_${1}" \
      --filter desired-state=running --no-trunc \
      --format '{{.ID}} {{.Node}} {{.CurrentState}}' \
    | awk '$3=="Running"{print $1, $2; exit}'
}

# ───────────────────────── kind/k8s helpers ────────────────────────────────────
k() {
  kubectl --context "$KIND_CONTEXT" -n "$K8S_NAMESPACE" "$@"
}

k8s_deploy_replicas_spec() {
  k get deploy "$1" -o jsonpath='{.spec.replicas}'
}

k8s_deploy_replicas_ready() {
  # Якщо немає readyReplicas — повертаємо 0
  local r; r="$(k get deploy "$1" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)"
  [ -z "$r" ] && r=0
  echo "$r"
}

k8s_pick_one_pod() {
  k get pods -l "app=$1" --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true
}

# ───────────────────────── Polling-обгортки ────────────────────────────────────
# wait_until_running <getter> <target> <deadline_ms> <on_change_callback>
#   getter: shell-функція, що друкує поточну кількість.
#   on_change: викликається з (new, old, t_ms_relative); може 'echo first_ready' тощо.
wait_running_count() {
  local getter="$1" target="$2" deadline_ms="$3"
  local start_ms; start_ms="$(now_ms)"
  local last; last="$($getter)"
  echo "INIT $last"
  local now el cur
  while :; do
    now="$(now_ms)"
    el=$((now - start_ms))
    cur="$($getter)"
    if [ "$cur" != "$last" ]; then
      echo "CHANGE $cur $last $el"
      last="$cur"
    fi
    if [ "$cur" = "$target" ]; then
      echo "DONE $el"
      return 0
    fi
    if [ "$el" -ge "$deadline_ms" ]; then
      echo "TIMEOUT $el"
      return 1
    fi
    sleep "$POLL_INTERVAL_S"
  done
}
