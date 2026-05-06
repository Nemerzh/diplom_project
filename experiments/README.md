# Experiments: симетричні сценарії для Swarm vs Kubernetes (kind)

Скрипти у цій папці запускаються однаково для обох оркестраторів — змінюється
лише `--platform=swarm|kind`. Результати зливаються в один CSV-файл
`infra/local/out/experiments.csv` (заголовок створюється автоматично).

Передумови:

* Swarm-кластер піднятий через `infra/local/swarm/setup.sh` (manager на VM
  `node-1`, можна перевизначити через `SWARM_MANAGER`).
* Kind-кластер піднятий через `infra/local/kind/up.sh` (контекст `kind-energy`,
  можна перевизначити через `KIND_CONTEXT`).
* На хості доступні `multipass`, `docker`, `kubectl`, `bash`.

## Сценарії

### `scale.sh` — масштабування
```
experiments/scale.sh --platform=swarm --service=backend --to=5
experiments/scale.sh --platform=kind  --service=backend --to=5
```
Замірює:
* `t_first_ready_ms` — час до появи першої «нової» готової репліки;
* `t_all_ready_ms` — час до досягнення цільової кількості.

### `failover.sh` — відмова контейнера/поду
```
experiments/failover.sh --platform=swarm --service=backend
experiments/failover.sh --platform=kind  --service=backend
```
Замірює:
* `t_first_ready_ms` (= drop) — момент, коли кількість Running впала нижче поточної;
* `t_all_ready_ms` (= recovered) — повернення до бажаної кількості.

### `rolling_update.sh` — повне rolling-оновлення
```
experiments/rolling_update.sh --platform=swarm --service=backend
experiments/rolling_update.sh --platform=kind  --service=backend
```
Для swarm використовує `service update --force`, для k8s — `kubectl rollout restart`.
Замірює `t_done_ms`.

### `run_all.sh` — все одразу
```
experiments/run_all.sh --platform=swarm --service=backend --base=2 --peak=5
experiments/run_all.sh --platform=kind  --service=backend --base=2 --peak=5
```

## Формат CSV

`infra/local/out/experiments.csv`

| колонка             | опис                                                          |
|---------------------|---------------------------------------------------------------|
| `ts_iso`            | момент завершення сценарію (UTC ISO-8601)                     |
| `platform`          | `swarm` або `kind`                                            |
| `scenario`          | `scale` / `failover` / `rolling_update`                       |
| `service`           | назва сервісу (`backend`, `frontend`, `simulator`, …)         |
| `from_n`            | репліки на старті                                             |
| `to_n`              | репліки на фініші                                             |
| `t_request_ms`      | час до повернення керування з API оркестратора                |
| `t_first_ready_ms`  | до першої зміни кількості готових (нова репліка / drop)        |
| `t_all_ready_ms`    | до досягнення цільової кількості готових                      |
| `t_done_ms`         | агрегатний «кінець» сценарію (для rolling_update — основний)  |
| `notes`             | людино-читні деталі (напр. яку задачу/под убивали)            |

## Корисні ENV

| змінна                | за замовчуванням             | опис                         |
|-----------------------|------------------------------|------------------------------|
| `SWARM_MANAGER`       | `node-1`                     | multipass-VM з manager-Swarm |
| `SWARM_STACK`         | `energy`                     | префікс імен сервісів        |
| `KIND_CONTEXT`        | `kind-energy`                | kubectl context              |
| `K8S_NAMESPACE`       | `energy`                     | namespace для бізнес-сервісів|
| `EXPERIMENTS_CSV`     | `infra/local/out/experiments.csv` | куди писати результати  |
| `POLL_INTERVAL_S`     | `0.2`                        | як часто опитувати стан       |
| `EXPERIMENT_TIMEOUT_S`| `300`                        | максимальний час одного кроку |
