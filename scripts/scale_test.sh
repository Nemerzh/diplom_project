#!/usr/bin/env bash
set -euo pipefail
SERVICE="${1:-backend}"
REPLICAS="${2:-3}"
docker service scale "energy_${SERVICE}=${REPLICAS}"
echo "scaled ${SERVICE} to ${REPLICAS}"
