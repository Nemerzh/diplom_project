#!/usr/bin/env bash
# Видаляє «осиротілі» config-об'єкти у swarm: ті, на які жоден сервіс не посилається.
# Запускається на manager-VM через multipass.
set -euo pipefail

MANAGER="${SWARM_MANAGER:-node-1}"

multipass exec "$MANAGER" -- bash -lc '
  # Збираємо список IDконфігів, що ВИКОРИСТОВУЮТЬСЯ хоч одним сервісом.
  used="$(docker service ls -q | xargs -r -I{} docker service inspect --format "{{range .Spec.TaskTemplate.ContainerSpec.Configs}}{{.ConfigID}} {{end}}" {} | tr " " "\n" | sort -u | grep -v "^$")"

  removed=0
  while IFS= read -r line; do
    id="${line%% *}"
    name="${line#* }"
    if [ -z "$id" ] || [ -z "$name" ]; then continue; fi
    if ! grep -qx "$id" <<<"$used"; then
      if docker config rm "$id" >/dev/null 2>&1; then
        echo "  removed: $name ($id)"
        removed=$((removed+1))
      fi
    fi
  done < <(docker config ls --format "{{.ID}} {{.Name}}")

  echo "Cleanup done: removed $removed stale config(s)."
'
