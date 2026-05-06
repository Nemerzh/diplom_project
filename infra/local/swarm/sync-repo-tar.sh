#!/usr/bin/env bash
# Копіює репозиторій на manager без multipass mount (архів tar через multipass transfer).
set -euo pipefail

ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
NODE="${MANAGER_NODE:-node-1}"
TARGET="${MOUNT_TARGET:-/home/ubuntu/diplom_project}"
TAR="${TMPDIR:-/tmp}/diplom_project_swarm_sync.tgz"

echo "Packing $ROOT -> $TAR (excluding heavy dirs)..."
tar czf "$TAR" \
  -C "$ROOT" \
  --exclude='./.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.venv' \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='.pytest_cache' \
  .

echo "Transferring to ${NODE}..."
multipass transfer "$TAR" "${NODE}:/tmp/diplom_project_swarm_sync.tgz"

echo "Extracting to ${TARGET}..."
multipass exec "$NODE" -- sudo bash -ec "rm -rf '${TARGET}' && mkdir -p '${TARGET}' && tar xzf /tmp/diplom_project_swarm_sync.tgz -C '${TARGET}' && chown -R ubuntu:ubuntu '${TARGET}' && rm -f /tmp/diplom_project_swarm_sync.tgz"

echo "Repo synced to ${NODE}:${TARGET}"
