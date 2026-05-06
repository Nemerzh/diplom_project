#!/usr/bin/env bash
# Деплой стека на swarm-кластер.
#
# Враховує immutability `configs`/`secrets` у Swarm: перед deploy ми рендеримо
# `stack.yml` → `stack.rendered.yml`, додаючи `name: <orig>-<sha8>` для кожного
# config, де <sha8> — перші 8 символів sha256 від файлу. Завдяки цьому
# при зміні вмісту файлу ми отримуємо НОВИЙ config-об'єкт, а не помилку
# «only updates to Labels are allowed».
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="${MOUNT_TARGET:-/home/ubuntu/diplom_project}"
MANAGER="${SWARM_MANAGER:-node-1}"
STACK_NAME="${SWARM_STACK:-energy}"

echo "Render stack.yml → stack.rendered.yml (з content-hash іменами configs)..."
bash "$ROOT/infra/local/swarm/render-stack.sh" "$ROOT/deploy/swarm/stack.rendered.yml"

echo "Deploying stack '${STACK_NAME}' from ${TARGET} on ${MANAGER}..."
multipass exec "$MANAGER" -- bash -lc "cd '$TARGET' && docker stack deploy -c deploy/swarm/stack.rendered.yml '$STACK_NAME'"

echo
multipass exec "$MANAGER" -- docker stack services "$STACK_NAME"

if [ "${CLEANUP_STALE_CONFIGS:-1}" = "1" ]; then
  echo
  echo "Cleanup осиротілих configs..."
  bash "$ROOT/infra/local/swarm/cleanup-stale-configs.sh" || true
fi
