#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-energy_backend}"
CONTAINER_ID=$(docker ps --filter "name=${TARGET}" --format "{{.ID}}" | head -n 1)
if [ -z "${CONTAINER_ID}" ]; then
  echo "container not found"
  exit 1
fi
docker kill "${CONTAINER_ID}"
echo "killed ${CONTAINER_ID}; orchestrator should recreate it"
