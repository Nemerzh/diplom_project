#!/usr/bin/env bash
# Docker Swarm не сумісний із live-restore у daemon.json (помилка при swarm init).
# Викликати один раз на існуючих VM, якщо cloud-init ще містив "live-restore": true.
set -euo pipefail

for node in node-1 node-2 node-3; do
  echo "[$node] rewriting /etc/docker/daemon.json (no live-restore), restarting docker..."
  multipass exec "$node" -- sudo bash -ec '
cat >/etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
EOF
systemctl restart docker
sleep 2
docker info >/dev/null
'
  echo "[$node] ok"
done
