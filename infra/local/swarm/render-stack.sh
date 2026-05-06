#!/usr/bin/env bash
# Рендеримо deploy/swarm/stack.yml → deploy/swarm/stack.rendered.yml,
# додаючи в кожен `configs.<name>` поле `name: <name>-<sha8>` на основі sha256 від файлу.
#
# Це обходить immutability docker swarm configs: при зміні вмісту файлу ми отримуємо
# НОВЕ ім'я config-об'єкта і `docker stack deploy` нормально його створить, а сервіси
# отримають референс на новий конфіг через `source:` (який резолвиться по ключу,
# а не по `name:`).
#
# Старі config-об'єкти залишаються «осиротілими» в swarm; для їх очистки —
# infra/local/swarm/cleanup-stale-configs.sh.
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
SRC="${SRC:-$ROOT/deploy/swarm/stack.yml}"
DEST="${1:-$ROOT/deploy/swarm/stack.rendered.yml}"

PY=""
for c in python3 python py; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "render-stack: потрібен python у PATH" >&2; exit 1; }

ROOT_PY="$ROOT" SRC_PY="$SRC" DEST_PY="$DEST" "$PY" - <<'PY_EOF'
import hashlib, os, re, sys

src  = os.environ['SRC_PY']
dest = os.environ['DEST_PY']
root = os.path.dirname(os.path.abspath(src))

with open(src, 'r', encoding='utf-8') as f:
    lines = f.readlines()

out, in_configs, item_name, item_file, pending = [], False, None, None, []

def sha8(rel_path: str) -> str:
    full = os.path.normpath(os.path.join(root, rel_path))
    h = hashlib.sha256()
    with open(full, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()[:8]

def flush(out, item_name, item_file, pending):
    if item_name and item_file:
        # Перевірка: чи `name:` уже існує — тоді не дублюємо.
        has_name = any(re.match(r'^\s+name:\s', l) for l in pending)
        if not has_name:
            digest = sha8(item_file)
            for i, l in enumerate(pending):
                if re.match(r'^\s+file:\s', l):
                    indent = re.match(r'^(\s+)', l).group(1)
                    pending.insert(i+1, f'{indent}name: {item_name}-{digest}\n')
                    break
    out.extend(pending)
    return [], None, None

i = 0
while i < len(lines):
    line = lines[i]
    if re.match(r'^configs:\s*$', line):
        in_configs = True
        out.append(line); i += 1; continue
    if in_configs and re.match(r'^[A-Za-z]', line):
        # покинули top-level секцію configs:
        pending, item_name, item_file = flush(out, item_name, item_file, pending)
        in_configs = False
        out.append(line); i += 1; continue
    if in_configs:
        m_item = re.match(r'^(\s{2})([\w-]+):\s*$', line)
        if m_item:
            pending, item_name, item_file = flush(out, item_name, item_file, pending)
            item_name = m_item.group(2)
            pending = [line]; i += 1; continue
        m_file = re.match(r'^\s+file:\s*(\S.*)$', line)
        if m_file:
            item_file = m_file.group(1).strip().strip('"').strip("'")
            pending.append(line); i += 1; continue
        pending.append(line); i += 1; continue
    out.append(line); i += 1

if in_configs:
    pending, item_name, item_file = flush(out, item_name, item_file, pending)

with open(dest, 'w', encoding='utf-8', newline='\n') as f:
    f.writelines(out)
PY_EOF

echo "render-stack: $DEST"
