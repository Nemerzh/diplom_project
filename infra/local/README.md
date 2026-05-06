# Локальний Swarm + kind

Скрипти та `Makefile` у корені репозиторію реалізують сценарій з [`swarm-kind-demo-plan.md`](../../swarm-kind-demo-plan.md) для **energy-metering** (образи `energy-*`, `deploy/swarm/stack.yml`, `deploy/k8s/`).

## Вимоги

- **Git Bash** або **WSL** (bash), **Docker Desktop**, **kubectl**, **kind**, **Multipass** у PATH.
- У Windows `winget` може бути лише в `%LOCALAPPDATA%\Microsoft\WindowsApps` — додайте до PATH або викликайте повним шляхом.

### Git Bash на Windows (PATH)

Якщо `make` або `multipass` не знаходяться, додайте в `~/.bashrc`:

```bash
export PATH="$PATH:/c/Program Files (x86)/GnuWin32/bin"
export PATH="$PATH:/c/Program Files/Multipass/bin"
```

### PowerShell (не знаходить `bash`)

`Makefile` викликає скрипти через **Git Bash**. У PowerShell перед `make`:

```powershell
cd C:\Users\Oleksandr\Desktop\term_8\diplom_project
$env:GIT_BASH = "C:\Program Files\Git\bin\bash.exe"
make swarm-up
```

Якщо Git у іншому місці — підставте свій шлях до `bash.exe`. Або відкрийте вікно **Git Bash** у каталозі проєкту й виконуйте `make` там.

**Примітка:** `make` працює лише з **кореня репозиторію** (де лежить `Makefile`), не з `C:\Users\Oleksandr`.

## Швидкі команди (`make` з кореня репо)

| Ціль | Дія |
|------|-----|
| `make help` | Список цілей |
| `make build-images` | Зібрати три образи |
| `make kind-up` | Кластер **kind** `energy`, застосувати K8s, Job міграцій, NodePort **8000/8081** |
| `make kind-down` | Видалити kind-кластер |
| `make vms-up` | Лише Multipass VM |
| `make swarm-fix-docker` | Прибрати `live-restore` з Docker на node-1…3 (потрібно, якщо `swarm init` скаржиться на live-restore) |
| `make swarm-up` | VM + `docker swarm` (manager node-1) |
| `make swarm-ensure-repo` | Репозиторій на node-1: **mount** або `SYNC_REPO_WITH_TAR=1` + tar |
| `make swarm-sync-repo-tar` | Лише копія репо tarball на node-1 (без `multipass mount`) |
| `make swarm-deploy` | ensure-repo → образи на ноди → секрети → `docker stack deploy` |
| `make swarm-down` | Вийти з swarm, зупинити VM |
| `make demo-up` | **Усе разом** (RAM ~ max; для презентації краще по черзі) |
| `make demo-down` | `kind-down` + `swarm-down` |
| `make clean` | `demo-down` + видалення VM |

## Важливі деталі

### Swarm

- Якщо **`live-restore` incompatible with swarm mode** — у старому `cloud-init` було `"live-restore": true`. Один раз: **`make swarm-fix-docker`**, потім знову **`make swarm-up`** (або лише `bash infra/local/swarm/setup.sh`). Нові VM з оновленого `multipass/cloud-init.yaml` уже без `live-restore`.
- **`Mounts are disabled on this installation of Multipass`:** за замовчуванням mount вимкнено. Увімкнути: **`multipass set local.privileged-mounts=true`**, потім у PowerShell **від адміністратора** **`Restart-Service multipass`**. Докладно: [Multipass set / privileged-mounts](https://canonical.com/multipass/docs/set-command#local.privileged-mounts). Після цього знову **`make swarm-deploy`**.
- **Без mount:** один рядок повного деплою: **`SYNC_REPO_WITH_TAR=1 make swarm-deploy`** (унутрі **`ensure-repo`** викличе `sync-repo-tar.sh` замість mount).
- `deploy/swarm/stack.yml` читає **файли** з репо (`monitoring/`, `scenario.yaml`). На manager має бути **повне дерево** у `/home/ubuntu/diplom_project` (mount або `sync-repo-tar.sh`).
- Секрети для демо: `swarm/create-demo-secrets.sh` (паролі за замовчуванням **energy** / **admin**). Для продакшену див. [`deploy/swarm/SECRETS.md`](../../deploy/swarm/SECRETS.md).
- Артефакти `docker save`: каталог `infra/local/out/` (у `.gitignore`).
- **`docker save … chtimes /var/lib/docker/tmp/...: input/output error`** — транзитний збій Docker Desktop / WSL2-бекенду. `load-images.sh` має 3 спроби з паузою; якщо збій стійкий — **перезапустіть Docker Desktop** (іконка в треї → Restart) або виконайте **`docker system prune -a -f`** і знову **`make swarm-load-images`**. Скрипт ідемпотентний: образи з тим же image ID на нодах пропускаються.

### Kubernetes (kind)

- Конфіг: `infra/local/kind/cluster.yaml`, ім’я кластера **energy**, контекст `kind-energy`.
- Застосовуються [`deploy/k8s/energy-platform.yaml`](../../deploy/k8s/energy-platform.yaml), Job [`deploy/k8s/backend-migrate-job.yaml`](../../deploy/k8s/backend-migrate-job.yaml) та [`deploy/k8s/simulator.yaml`](../../deploy/k8s/simulator.yaml) (Deployment симулятора з ConfigMap-сценарієм; параметри ті ж, що в Swarm).
- Після міграцій сервіси патчаться у **NodePort** 30080/30081 з пробросом на **localhost:8000** та **:8081**.
- Ingress у маніфесті без контролера не використовується; орієнтуйтесь на порти вище.
- **Persистентність БД між `kind-down`/`kind-up`:** `kind-down` робить `pg_dump --clean --if-exists --no-owner --no-privileges` у `infra/local/out/kind-pg-backup.sql` (каталог у `.gitignore`). `kind-up` після `alembic upgrade head` дивиться на цей файл і, якщо таблиця `meters` порожня, виконує `psql … < backup.sql`, потім ще раз ганяє Job міграцій (бекап міг бути зі старішого коду). PVC `postgres-data` теж залишає дані всередині живого кластера — restore спрацьовує лише на «свіжій» БД, щоб не затерти актуальні дані.
  - Змінні: `KIND_SKIP_BACKUP=1` (вимкнути дамп у `down`), `KIND_RESTORE=0` (вимкнути restore в `up`), `KIND_RESTORE_FORCE=1` (залити бекап навіть поверх непорожньої БД), `KIND_PG_BACKUP_FILE=/path/to.sql`, `KIND_RESTORE_PROBE_TABLE=meters` (інша таблиця-індикатор «порожньої» БД).

### Змінні середовища (опційно)

| Змінна | Зміст |
|--------|--------|
| `VM_IMAGE` | Аліас образу Multipass: **`jammy`** за замовчуванням (Ubuntu **Server** 22.04). Для 24.04: **`noble`**. Уникайте сирого `22.04` — Multipass може підтягнути **Ubuntu Core** (`cdimage…ubuntu-core`), а не cloud server. Перевірка: `multipass find`. |
| `REPO_ROOT` | Абсолютний шлях до репо для `mount-repo.sh` (якщо авто не спрацьовує) |
| `POSTGRES_PASSWORD` | Пароль для демо-secrets і рядка `backend_database_url` |
| `KIND_CLUSTER_NAME` | Ім’я kind-кластера (за замовчуванням `energy`) |

### Multipass: не качається образ Ubuntu

Повідомлення на кшталт `Failed to get https://cloud-images.ubuntu.com/...`:

1. Повторити пізніше або вимкнути VPN / перевірити фаєрвол і проксі.
2. Використовувати аліас **Server**, не «голі» цифри: **`jammy`** (22.04), **`noble`** (24.04):  
   `VM_IMAGE=jammy make vms-up`
3. Аліаси: `multipass find`.

### Multipass: мало місця на C:, «Failed to copy … .vhdx», «Available disk … below minimum»

Дані й кеш Multipass за замовчуванням лежать у **`C:\ProgramData\Multipass`** (копії образів `ubuntu-…-cloudimg-amd64.vhdx` для кожної нової VM займають гігабайти). Якщо **`D:`** просторіший, можна **перенести всю папку на `D:`** і залишити на `C:` лише **junction** (посилання каталогу):

1. Зупинити VM і службу (PowerShell **від адміністратора**):
   ```powershell
   multipass stop --all
   Stop-Service multipass
   ```
2. Скопіювати дані на диск `D:` (приклад — каталог `D:\MultipassData`):
   ```powershell
   robocopy "C:\ProgramData\Multipass" "D:\MultipassData" /E /COPYALL /DCOPY:T
   ```
   Переконайтеся, що копія повна; за потреби закрийте все, що могло тримати файли.
3. Видалити оригінал і створити junction (**Cmd від адміністратора** часто надійніше за PowerShell для `mklink`):
   ```cmd
   rmdir /s /q "C:\ProgramData\Multipass"
   mklink /J "C:\ProgramData\Multipass" "D:\MultipassData"
   ```
4. Запустити службу й перевірити:
   ```powershell
   Start-Service multipass
   multipass list
   ```
5. Знову **`make vms-up`** (за потреби спочатку `multipass delete --all` / `purge`, якщо інстанси в неконсистентному стані).

Орієнтовно для **трьох VM** з **`VM_DISK=8G`** на диску потрібно **десятки ГБ** вільного місця (образ + зростання дисків). Зменшити розмір диска VM можна так: **`VM_DISK=5G make vms-up`** — це не прибирає потребу у вільному місці для копій базового образу, але трохи зменшує верхню межу на кожну машину.

Окремо в **Hyper-V Manager → Hyper-V Settings** можна перенести **дефолтні шляхи віртуальних дисків/машин** на `D:` — це добре поєднується з переносом `ProgramData` вище.

### Multipass: `cannot connect to the multipass socket`

Часто після збою завантаження. У PowerShell **від адміністратора**:

```powershell
Restart-Service multipass
```

Або перезавантажити ПК. Потім знову `make vms-up`.

На Windows надійніше спочатку перевірити **`multipass version`** у PowerShell; якщо в Git Bash постійно «socket», використовуй PowerShell для команд Multipass.

### Multipass: `Remote "" is unknown or unreachable`

Зазвичай упав або некоректно налаштований бекенд (Hyper‑V). Після `Restart-Service multipass` перевірте компоненти Windows (Hyper‑V, платформа VM). Якщо HTTPS до Canonical блокується (антивірус/VPN), завантаження образів і навіть оновлення каталогу (`multipass find`) падають з `Operation canceled` — спробуйте іншу мережу або винятки у фаєрволі.

### Якщо Multipass так і не запускається

Для диплому можна показати лише **kind** (`make kind-up`), а сценарій Swarm на реальних VM — за [`swarm-kind-demo-plan.md`](../../swarm-kind-demo-plan.md) розділом про хмару або окремий запис.

## Перший запуск Swarm (ручний ланцюжок)

```bash
make swarm-up
make swarm-deploy
```

Перевірка на manager: `multipass exec node-1 -- docker stack services energy`

## Перший запуск kind

```bash
make kind-up
```

Перевірка: `kubectl --context kind-energy get pods -n energy`

## Моніторинг та інфра-метрики

Із цього моменту обидва стеки несуть однаковий набір експортерів — це
дає змогу одними запитами Prometheus порівнювати поведінку Swarm і
Kubernetes (CPU/RAM по нодах і контейнерах, кількість реплік тощо).

| Компонент             | Compose / Swarm                                    | Kind (kubernetes)                                   |
|-----------------------|----------------------------------------------------|-----------------------------------------------------|
| Prometheus            | `prometheus` сервіс, порт **9090** (`localhost:9090`) | Deployment у ns `monitoring`, NodePort **30090 → 9090** |
| Grafana               | `grafana` сервіс, порт **3000** (`localhost:3000`) | Deployment у ns `monitoring`, NodePort **30030 → 3000** |
| `node-exporter`       | global service (по 1 на ноду), DNS `tasks.node-exporter:9100` | DaemonSet `monitoring/node-exporter` |
| `cAdvisor`            | global service, DNS `tasks.cadvisor:8080`          | DaemonSet `monitoring/cadvisor`                      |
| `kube-state-metrics`  | (n/a — Swarm не має ресурсу `Deployment`)          | Deployment `monitoring/kube-state-metrics` + RBAC    |
| Дашборди              | Grafana → folder *Energy* (overview + infra + replicas) | Аналогічно (JSON-и грузяться як `ConfigMap`)         |

Дашборди:
* **Energy Platform Overview** — бізнес-метрики (RPS, p95, читання, алерти).
* **Infra: Nodes & Containers** — CPU/RAM/мережа/диск з node-exporter і cAdvisor.
* **Replicas** — реплікація з kube-state-metrics (для swarm — кількість контейнерів `energy-*` за labels cAdvisor).

Усі дашборди явно `timezone: Europe/Kyiv`; Grafana також стартує з
`GF_DATE_FORMATS_DEFAULT_TIMEZONE=Europe/Kyiv`.

Вимкнути моніторинг у kind-up: `KIND_SKIP_MONITORING=1 make kind-up`.

## Безпека Kubernetes

`deploy/k8s/energy-platform.yaml`, `simulator.yaml`, `backend-migrate-job.yaml`:

* `automountServiceAccountToken: false` для всіх podSpec, які не звертаються до K8s API.
* `securityContext`:
  * `runAsNonRoot: true`, конкретний `runAsUser`/`runAsGroup` (1000 для python-додатків, 70 для postgres, 472 для grafana, 65534 для prometheus).
  * `seccompProfile.type: RuntimeDefault`.
  * `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`.
  * `readOnlyRootFilesystem: true` для backend, simulator, prometheus, kube-state-metrics, node-exporter (з `emptyDir` на `/tmp`, де треба).
  * Для frontend (nginx з bind на :80) — drop ALL + `add: [NET_BIND_SERVICE, CHOWN, SETUID, SETGID]`.
  * cAdvisor — `privileged: true` (вимагає доступу до cgroup).
* `deploy/k8s/network-policies.yaml` — default-deny + allow-pairs (postgres приймає лише backend, backend — frontend/simulator/monitoring/NodePort, тощо). За замовчуванням kind-CNI без enforcement, тож політики застосовуються як «policy-as-documentation»; для реального enforcement — встановіть Calico (інструкція в коментарі файлу).

## Симетричні експерименти

Скрипти у [`experiments/`](../../experiments/) дають однаковий API для Swarm і
Kind через `--platform=swarm|kind`. Результати пишуться в один CSV
`infra/local/out/experiments.csv`:

```bash
# Масштабування
bash experiments/scale.sh           --platform=swarm --service=backend --to=5
bash experiments/scale.sh           --platform=kind  --service=backend --to=5

# Відмова контейнера / поду
bash experiments/failover.sh        --platform=swarm --service=backend
bash experiments/failover.sh        --platform=kind  --service=backend

# Rolling update
bash experiments/rolling_update.sh  --platform=swarm --service=backend
bash experiments/rolling_update.sh  --platform=kind  --service=backend

# Усе по черзі
bash experiments/run_all.sh         --platform=kind  --service=backend --base=2 --peak=5
```

Деталі схеми CSV і ENV-перевизначення — у [`experiments/README.md`](../../experiments/README.md).
