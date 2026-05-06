#!/usr/bin/env bash
# Зберігає образи energy-* та завантажує їх на node-1 node-2 node-3 через multipass transfer.
# Ідемпотентний: якщо ID образу на ноді вже збігається з локальним — пропускає.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"
# На Windows Multipass сприймає "C:\..." як "instance:path" через двокрапку після диска.
# Використовуємо відносні шляхи від кореня репо.
OUT_REL="infra/local/out"
mkdir -p "$OUT_REL"

IMAGES=(energy-backend:latest energy-frontend:latest energy-simulator:latest)
NODES=(node-1 node-2 node-3)

# docker save іноді падає з chtimes EIO у /var/lib/docker/tmp (транзитний збій Docker Desktop / WSL2).
# Робимо до 3 спроб; між ними даємо час бекенду охолонути.
docker_save_retry() {
  local img="$1" out="$2" attempt=1 max=3
  while (( attempt <= max )); do
    if docker save "$img" > "$out"; then
      return 0
    fi
    echo "docker save '$img' attempt $attempt/$max failed, retrying..." >&2
    rm -f "$out"
    sleep $(( attempt * 3 ))
    attempt=$(( attempt + 1 ))
  done
  echo "docker save '$img' failed after $max attempts. Restart Docker Desktop and retry." >&2
  return 1
}

# Перевіряє, чи образ із таким же image ID уже є на ноді.
node_has_image() {
  local node="$1" img="$2" local_id remote_id
  local_id="$(docker image inspect --format '{{.Id}}' "$img" 2>/dev/null || true)"
  [[ -z "$local_id" ]] && return 1
  remote_id="$(multipass exec "$node" -- docker image inspect --format '{{.Id}}' "$img" 2>/dev/null || true)"
  [[ "$local_id" == "$remote_id" ]]
}

for img in "${IMAGES[@]}"; do
  safe="${img//[:]/_}"
  tar_rel="${OUT_REL}/${safe}.tar"
  tar_abs="${ROOT}/${OUT_REL}/${safe}.tar"

  needs_save=0
  for node in "${NODES[@]}"; do
    if ! node_has_image "$node" "$img"; then
      needs_save=1
      break
    fi
  done

  if (( needs_save == 0 )); then
    echo "Skipping $img (already loaded on all nodes with matching ID)."
    continue
  fi

  echo "Saving $img -> $tar_abs"
  # docker save -o на Git Bash + Docker Desktop інколи ламається; перенаправлення стабільніше.
  docker_save_retry "$img" "$tar_abs"

  for node in "${NODES[@]}"; do
    if node_has_image "$node" "$img"; then
      echo "  $node: already up to date, skip."
      continue
    fi
    base="$(basename "$tar_rel")"
    multipass transfer "$tar_rel" "$node:/tmp/$base"
    # Git Bash перетворює /tmp/... на Windows Temp перед multipass exec → помилка OLEKSA~1\...\Temp.
    # Префікс // вимикає конвертацію; у Linux //tmp == /tmp.
    multipass exec "$node" -- docker load -i "//tmp/$base"
  done
done

echo "Images loaded on all nodes."
