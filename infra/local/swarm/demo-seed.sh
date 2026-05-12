#!/usr/bin/env bash
# Той самий демо-сид, що в Compose / k8s. Swarm overlay зазвичай не attachable — тому запуск у
# вже працюючому контейнері backend (ті самі мережа й DATABASE_URL з секрету).
# Передумови: stack energy розгорнуто, сервіс backend у стані running.
set -euo pipefail

MANAGER="${SWARM_MANAGER:-node-1}"
STACK="${SWARM_STACK:-energy}"
RESET="${COMPOSE_TOPOLOGY_RESET:-${DEMO_SEED_RESET:-0}}"

echo "Шукаю контейнер сервісу ${STACK}_backend на ${MANAGER}..."
CID="$(multipass exec "$MANAGER" -- bash -lc "docker ps -qf name=${STACK}_backend | head -1")"
if [ -z "$CID" ]; then
  echo "Помилка: немає running-контейнера «${STACK}_backend». Спочатку: make swarm-deploy (або stack deploy)." >&2
  exit 1
fi

echo "Запуск: docker exec $CID python -m scripts.compose_seed_network (COMPOSE_TOPOLOGY_RESET=$RESET)..."
multipass exec "$MANAGER" -- docker exec \
  -e COMPOSE_TOPOLOGY_RESET="$RESET" \
  -e DEMO_SEED_RESET="$RESET" \
  "$CID" \
  python -m scripts.compose_seed_network

echo "Готово."
