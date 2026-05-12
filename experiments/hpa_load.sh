#!/usr/bin/env bash
# Експеримент 4: автоматичне масштабування Kubernetes HorizontalPodAutoscaler.
#
# Сценарій:
#   0. (опційно, --quiet-simulator=1) масштабуємо `simulator` у 0 — інакше його
#      фоновий трафік тримає backend під навантаженням і HPA не повертається до min.
#   1. Чекаємо, поки HPA вийде у `currentReplicas == minReplicas` (--prepare-timeout=180c).
#      Якщо за цей час не вийде — продовжуємо з тим, що є, з попередженням.
#   2. Запускаємо CONCURRENCY паралельних HTTP-навантажувачів на backend.
#   3. У циклі (1с) читаємо HPA і логуємо зміни currentReplicas:
#        • t_first_scale_up_ms  — перше зростання реплік (старт > min)
#        • t_max_replicas_ms    — досягнення maxReplicas (якщо було)
#   4. Через DURATION секунд зупиняємо навантажувачі.
#   5. Чекаємо scaleDown (поведінка HPA: stabilizationWindowSeconds=120):
#        • t_first_scale_down_ms — перше зменшення реплік
#        • t_back_to_min_ms      — повернення до minReplicas
#   6. Відновлюємо simulator (якщо паузили).
#   7. Усе пишемо в experiments.csv (scenario=hpa_load).
#
# Платформа:
#   Тільки kind. У Docker Swarm немає вбудованого HPA — це частина порівняння у дипломі.
#
# Використання:
#   experiments/hpa_load.sh --platform=kind [--service=backend]
#                           [--concurrency=20] [--duration=120]
#                           [--url=http://localhost:8000/sites]
#                           [--cooldown=600]
#                           [--quiet-simulator=1] [--prepare-timeout=300]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$HERE/lib/common.sh"

parse_kv_args "$@"
PLATFORM="$(require_arg platform)"
SERVICE="$(arg service backend)"
CONCURRENCY="$(arg concurrency 20)"
DURATION_S="$(arg duration 120)"
# /sites — простий GET без агрегацій (швидкий, не блокує backend під 50 паралельних
# запитів); цього достатньо щоб CPU перевищило 60% від requests=100m.
URL="$(arg url "http://localhost:8000/sites")"
COOLDOWN_S="$(arg cooldown 600)"
QUIET_SIM="$(arg quiet_simulator 1)"
PREPARE_TIMEOUT_S="$(arg prepare_timeout 300)"

if [ "$PLATFORM" != "kind" ]; then
  die "hpa_load підтримується лише на kind (Swarm не має вбудованого autoscaler — це частина порівняння у дипломі)"
fi

hpa_current() {
  k get hpa "$SERVICE" -o jsonpath='{.status.currentReplicas}' 2>/dev/null || echo 0
}
hpa_min() {
  k get hpa "$SERVICE" -o jsonpath='{.spec.minReplicas}' 2>/dev/null || echo 0
}
hpa_max() {
  k get hpa "$SERVICE" -o jsonpath='{.spec.maxReplicas}' 2>/dev/null || echo 0
}

if ! k get hpa "$SERVICE" >/dev/null 2>&1; then
  die "HPA '$SERVICE' не знайдено у namespace '$K8S_NAMESPACE'. Чи застосовано deploy/k8s/hpa.yaml? (KIND_DISABLE_HPA=0 у kind-up.sh)"
fi

MIN="$(hpa_min)"
MAX="$(hpa_max)"

# ───────────────────────── Підготовка: пауза simulator ──────────────────────────
SIMULATOR_PAUSED=0
restore_simulator() {
  if [ "$SIMULATOR_PAUSED" = "1" ]; then
    log "Відновлюю simulator → 1 репліку"
    k scale deploy/simulator --replicas=1 >/dev/null 2>&1 || true
    SIMULATOR_PAUSED=0
  fi
}

if [ "$QUIET_SIM" = "1" ]; then
  if k get deploy/simulator >/dev/null 2>&1; then
    log "Пауза simulator (щоб не зашумлював HPA)..."
    k scale deploy/simulator --replicas=0 >/dev/null 2>&1 || true
    SIMULATOR_PAUSED=1
  fi
fi

# ───────────────────────── Підготовка: чекаємо HPA → min ───────────────────────
log "Чекаю, поки HPA вийде у currentReplicas == minReplicas=$MIN (timeout ${PREPARE_TIMEOUT_S}с)..."
PREPARE_DEADLINE=$(( $(now_ms) + PREPARE_TIMEOUT_S * 1000 ))
while :; do
  CUR_PREP="$(hpa_current)"
  if [ "$CUR_PREP" = "$MIN" ]; then
    log "Готово: currentReplicas=$CUR_PREP"
    break
  fi
  if [ "$(now_ms)" -ge "$PREPARE_DEADLINE" ]; then
    warn "Не дочекався min=$MIN за ${PREPARE_TIMEOUT_S}с (зараз $CUR_PREP). Продовжую з поточним."
    break
  fi
  sleep 5
done

INIT_CUR="$(hpa_current)"
log "HPA $SERVICE: min=$MIN max=$MAX currentReplicas=$INIT_CUR (старт експерименту)"
log "Лоад: $CONCURRENCY паралельних запитів на $URL протягом $DURATION_S с"

# ───────────────────────── Запуск навантажувачів ───────────────────────────────
LOAD_FLAG="$(mktemp -t hpa_load_flag.XXXXXX)"
LOAD_PIDS=()
spawn_load() {
  local i
  for i in $(seq 1 "$CONCURRENCY"); do
    (
      while [ -f "$LOAD_FLAG" ]; do
        # 2>/dev/null глушить шум `curl: (28) timeout` — backlog на дуже агресивних
        # endpoint-ах не критичний, нас цікавить лише факт навантаження CPU.
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
  restore_simulator
}
trap 'cleanup_all' EXIT INT TERM

START_MS="$(now_ms)"
spawn_load
log "Лоад запущено (PID-и: ${#LOAD_PIDS[@]} процесів)"

# ───────────────────────── Фаза 1: scale-up ────────────────────────────────────
T_FIRST_UP_MS=""
T_MAX_MS=""
LAST="$INIT_CUR"
LOAD_END_MS=$(( START_MS + DURATION_S * 1000 ))

while :; do
  NOW="$(now_ms)"
  EL=$(( NOW - START_MS ))
  CUR="$(hpa_current)"
  if [ "$CUR" != "$LAST" ]; then
    log "scale-up: currentReplicas $LAST → $CUR за ${EL} мс"
    if [ -z "$T_FIRST_UP_MS" ] && [ "$CUR" -gt "$INIT_CUR" ]; then
      T_FIRST_UP_MS="$EL"
    fi
    if [ -z "$T_MAX_MS" ] && [ "$CUR" = "$MAX" ]; then
      T_MAX_MS="$EL"
    fi
    LAST="$CUR"
  fi
  if [ "$NOW" -ge "$LOAD_END_MS" ]; then
    break
  fi
  sleep 1
done

stop_load
LOAD_STOP_MS=$(( $(now_ms) - START_MS ))
log "Лоад зупинено за ${LOAD_STOP_MS} мс. currentReplicas=$(hpa_current). Чекаю scale-down..."

# ───────────────────────── Фаза 2: scale-down ──────────────────────────────────
T_FIRST_DOWN_MS=""
T_BACK_MIN_MS=""
PEAK_AFTER_LOAD="$LAST"
COOLDOWN_DEADLINE_MS=$(( LOAD_STOP_MS + COOLDOWN_S * 1000 ))

while :; do
  NOW_EL=$(( $(now_ms) - START_MS ))
  CUR="$(hpa_current)"
  if [ "$CUR" != "$LAST" ]; then
    log "scale-down: currentReplicas $LAST → $CUR за ${NOW_EL} мс"
    if [ -z "$T_FIRST_DOWN_MS" ] && [ "$CUR" -lt "$LAST" ]; then
      T_FIRST_DOWN_MS="$NOW_EL"
    fi
    LAST="$CUR"
  fi
  if [ "$CUR" = "$MIN" ]; then
    T_BACK_MIN_MS="$NOW_EL"
    break
  fi
  if [ "$NOW_EL" -ge "$COOLDOWN_DEADLINE_MS" ]; then
    warn "cooldown timeout після ${NOW_EL} мс (currentReplicas=$CUR, min=$MIN)"
    break
  fi
  sleep 2
done

restore_simulator

# ───────────────────────── Підсумок ────────────────────────────────────────────
log "=== РЕЗУЛЬТАТИ HPA ==="
log "  initial currentReplicas:        $INIT_CUR"
log "  peak after load:                $PEAK_AFTER_LOAD"
log "  t_first_scale_up_ms:            ${T_FIRST_UP_MS:-NA}"
log "  t_max_replicas_ms:              ${T_MAX_MS:-NA}"
log "  t_load_stop_ms:                 $LOAD_STOP_MS"
log "  t_first_scale_down_ms (rel 0):  ${T_FIRST_DOWN_MS:-NA}"
log "  t_back_to_min_ms (rel 0):       ${T_BACK_MIN_MS:-NA}"

NOTES="hpa min=$MIN max=$MAX peak=$PEAK_AFTER_LOAD load_stop=${LOAD_STOP_MS}ms first_down=${T_FIRST_DOWN_MS:-NA} back_min=${T_BACK_MIN_MS:-NA} sim_paused=$QUIET_SIM"
csv_append "$PLATFORM" "hpa_load" "$SERVICE" "$INIT_CUR" "$PEAK_AFTER_LOAD" \
  0 "${T_FIRST_UP_MS:-}" "${T_MAX_MS:-}" "${T_BACK_MIN_MS:-}" "$NOTES"

echo "platform=$PLATFORM scenario=hpa_load service=$SERVICE init=$INIT_CUR peak=$PEAK_AFTER_LOAD t_first_up_ms=${T_FIRST_UP_MS:-NA} t_max_ms=${T_MAX_MS:-NA} t_first_down_ms=${T_FIRST_DOWN_MS:-NA} t_back_min_ms=${T_BACK_MIN_MS:-NA}"