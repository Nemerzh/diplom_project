#!/usr/bin/env bash
set -euo pipefail
SERVICE="${1:-energy_backend}"
IMAGE="${2:-energy-backend:latest}"
docker service update --image "${IMAGE}" --update-parallelism 1 --update-delay 10s "${SERVICE}"
