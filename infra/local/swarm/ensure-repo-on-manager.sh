#!/usr/bin/env bash
# Репозиторій на manager: спочатку mount, інакше підказка / tar.
set -euo pipefail

ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
NODE="${MANAGER_NODE:-node-1}"
TARGET="${MOUNT_TARGET:-/home/ubuntu/diplom_project}"
HERE="$(dirname "${BASH_SOURCE[0]}")"

if [[ "${SYNC_REPO_WITH_TAR:-0}" == "1" ]]; then
  echo "SYNC_REPO_WITH_TAR=1: копіювання репо без mount"
  exec "$HERE/sync-repo-tar.sh"
fi

echo "Mount: $ROOT -> ${NODE}:${TARGET}"
multipass umount "${NODE}:${TARGET}" 2>/dev/null || true
if multipass mount "$ROOT" "${NODE}:${TARGET}"; then
  exit 0
fi

cat <<'EOF' >&2

multipass mount не вдалось (часто: Mounts are disabled).

Варіант A — увімкнути mount (зручно для розробки):
  multipass set local.privileged-mounts=true
  (PowerShell від адміністратора) Restart-Service multipass
  Потім знову: make swarm-deploy

Варіант B — без mount, одноразова копія репо на VM:
  SYNC_REPO_WITH_TAR=1 make swarm-ensure-repo
  make swarm-load-images swarm-secrets swarm-deploy-stack

Документація: infra/local/README.md (розділ про privileged-mounts)
EOF
exit 1
