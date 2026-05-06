#!/usr/bin/env bash
# Монтує корінь репозиторію в manager-VM, щоб `docker stack deploy` бачив
# deploy/swarm/stack.yml і відносні шляхи до monitoring/ та services/simulator/.
set -euo pipefail

ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
NODE="${MANAGER_NODE:-node-1}"
TARGET="${MOUNT_TARGET:-/home/ubuntu/diplom_project}"

echo "Mount: $ROOT -> ${NODE}:${TARGET}"
multipass umount "${NODE}:${TARGET}" 2>/dev/null || true
multipass mount "$ROOT" "${NODE}:${TARGET}"
