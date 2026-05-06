#!/usr/bin/env bash
set -euo pipefail
NODE="${MANAGER_NODE:-node-1}"
TARGET="${MOUNT_TARGET:-/home/ubuntu/diplom_project}"
multipass umount "${NODE}:${TARGET}" 2>/dev/null && echo "Unmounted ${NODE}:${TARGET}" || echo "No mount (ok)"
