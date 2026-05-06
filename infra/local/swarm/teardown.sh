#!/usr/bin/env bash
set -euo pipefail

for node in node-3 node-2 node-1; do
  if multipass info "$node" >/dev/null 2>&1; then
    multipass exec "$node" -- docker swarm leave --force 2>/dev/null || true
    echo "[$node] left swarm"
  fi
done

if [[ "${KEEP_RUNNING:-0}" != "1" ]]; then
  multipass stop node-1 node-2 node-3 2>/dev/null || true
  echo "VMs stopped"
fi
