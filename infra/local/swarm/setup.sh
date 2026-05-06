#!/usr/bin/env bash
set -euo pipefail

MGR_IP=$(multipass info node-1 | grep -m1 'IPv4:' | awk '{print $2}')

if [[ -z "$MGR_IP" || "$MGR_IP" == "null" ]]; then
  echo "ERROR: could not resolve node-1 IP" >&2
  exit 1
fi

echo "Manager IP: $MGR_IP"

if ! multipass exec node-1 -- docker info 2>/dev/null | grep -q "Swarm: active"; then
  multipass exec node-1 -- docker swarm init --advertise-addr "$MGR_IP"
else
  echo "Swarm already initialized on node-1"
fi

TOKEN=$(multipass exec node-1 -- docker swarm join-token -q worker)

for node in node-2 node-3; do
  if multipass exec "$node" -- docker info 2>/dev/null | grep -q "Swarm: active"; then
    echo "[$node] already in swarm"
  else
    echo "[$node] joining swarm..."
    multipass exec "$node" -- docker swarm join --token "$TOKEN" "${MGR_IP}:2377"
  fi
done

multipass exec node-1 -- docker node update --label-add role=app node-1 >/dev/null
multipass exec node-1 -- docker node update --label-add role=app node-2 >/dev/null
multipass exec node-1 -- docker node update --label-add role=app node-3 >/dev/null

echo
multipass exec node-1 -- docker node ls
