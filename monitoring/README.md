# Моніторинг (Prometheus + Grafana)

Набір конфігів для **спостереження** за стендом: збір метрик з сервісів і візуалізація в **Grafana**. Самі образи (`prom/prometheus`, `grafana/grafana`) піднімаються з **`deploy/compose/docker-compose.yml`**; цей каталог містить **provisioning** і файли, що монтуються в контейнери.

## Навіщо це в стенді

- Бачити навантаження та помилки бекенду й симулятора (лічильники прийнятих показів, ретраї POST тощо).
- Порівнювати поведінку **Docker Swarm** vs **Kubernetes** за однаковими dashboard’ами (метрики ті самі, змінюється оркестрація).
- Демонструвати повний цикл: збір → запити → дашборди.

## Prometheus

- Конфіг: **`prometheus/prometheus.yml`**.
- Інтервал scrape за замовчуванням: **15s**.
- Цілі в типовому compose (імена сервісів у мережі):

| Job | Target | `metrics_path` |
|-----|--------|------------------|
| `backend` | `backend:8000` | `/metrics` |
| `simulator` | `simulator:8010` | `/metrics` |
| `prometheus` | `prometheus:9090` | (вбудовані метрики) |

UI Prometheus після старту стенду: **`http://localhost:9090`**.

## Grafana

- **Datasource:** **`grafana/provisioning/datasources/datasource.yml`** — Prometheus за адресою **`http://prometheus:9090`** (внутрішня мережа Docker).
- **Dashboards:** **`grafana/provisioning/dashboards/dashboards.yml`** + JSON у **`grafana/dashboards/`** (наприклад огляд енергії).

Доступ за замовчуванням у compose: **`http://localhost:3000`** (логін/пароль задаються змінними `GF_SECURITY_*` у compose).

## Зв’язок із репозиторієм

Після змін у YAML або JSON дашбордів достатньо **перезапустити** контейнери `prometheus` / `grafana` (або `docker compose up -d`), щоб підхопити змонтовані файли.

Коротко: **`monitoring/` — це не окремий застосунок**, а конфігурація спостереження поверх уже існуючих **`/metrics`** у бекенді та симуляторі.
