#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NODES=("node-1" "node-2" "node-3")
CPUS="${VM_CPUS:-1}"
MEMORY="${VM_MEMORY:-1500M}"
DISK="${VM_DISK:-8G}"
# Не використовуйте лише "22.04" — Multipass може взяти Ubuntu Core замість Server.
# Див. multipass find. Для 24.04 LTS: VM_IMAGE=noble
IMAGE="${VM_IMAGE:-jammy}"
CLOUD_INIT="$(dirname "${BASH_SOURCE[0]}")/cloud-init.yaml"

echo "Repository root: $ROOT"
echo "Multipass image alias: $IMAGE (override with VM_IMAGE=...)"

_multipass_launch_failed() {
  cat <<'EOF' >&2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Помилка Multipass (мережа / Remote / «Failed to copy … .vhdx» / мало місця на диску)
Це середовище Windows/Hyper-V/daemon або диск C:, не цей bash-скрипт.

Якщо в логах є «Failed to copy … ProgramData\Multipass» або «Available disk … below minimum»:
  • На диску C: має бути кілька ГБ вільних; Multipass пише в C:\ProgramData\Multipass (cache + дані інстансів).
  • Перенесіть дані Multipass на D: через junction — розділ «Дані Multipass на D:» у infra/local/README.md
  • Або звільніть місце на C:, потім: multipass delete --all && multipass purge і знову make vms-up

Інші поширені кроки:
  • Перезавантажити ПК; через 5–15 хв повторити launch
  • Адмін PowerShell: Restart-Service multipass
  • Hyper-V + платформа VM у компонентах Windows; hosts.ics (дублікати) за докою Multipass
  • multipass set local.driver=virtualbox (потрібен VirtualBox)

Докладно: infra/local/README.md  |  Запасний план: make kind-up
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

for node in "${NODES[@]}"; do
  if multipass info "$node" >/dev/null 2>&1; then
    echo "[$node] already exists, ensuring it is started"
    multipass start "$node" || true
  else
    echo "[$node] launching..."
    if ! multipass launch \
      --name "$node" \
      --cpus "$CPUS" \
      --memory "$MEMORY" \
      --disk "$DISK" \
      --cloud-init "$CLOUD_INIT" \
      "$IMAGE"; then
      _multipass_launch_failed "$node"
      exit 1
    fi
  fi
done

echo
echo "Waiting for Docker to become ready on all nodes..."
for node in "${NODES[@]}"; do
  until multipass exec "$node" -- docker info >/dev/null 2>&1; do
    sleep 2
  done
  echo "[$node] Docker ready"
done

multipass list
