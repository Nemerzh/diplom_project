# Docker Swarm: secure deploy guide

Ця інструкція для продового/стейдж Swarm з використанням Docker secrets.

## 1) Підготувати кластер

На manager:

```bash
docker swarm init --advertise-addr <MANAGER_IP>
```

На worker (після отримання токена через `docker swarm join-token worker`):

```bash
docker swarm join --token <WORKER_TOKEN> <MANAGER_IP>:2377
```

Перевірка:

```bash
docker node ls
```

## 2) Зібрати і запушити образи (на CI або build-сервері)

Приклад:

```bash
docker build -t <REGISTRY>/energy-backend:latest services/backend
docker build -t <REGISTRY>/energy-frontend:latest services/frontend
docker build -t <REGISTRY>/energy-simulator:latest services/simulator

docker push <REGISTRY>/energy-backend:latest
docker push <REGISTRY>/energy-frontend:latest
docker push <REGISTRY>/energy-simulator:latest
```

У `deploy/swarm/stack.yml` вкажіть ті ж image names.

## 3) Створити secrets (на manager)

> Не зберігайте значення секретів у git/`stack.yml`.

```bash
printf '%s' '<STRONG_POSTGRES_PASSWORD>' | docker secret create postgres_password -
printf '%s' '<STRONG_GRAFANA_ADMIN_PASSWORD>' | docker secret create grafana_admin_password -
printf '%s' 'postgresql+psycopg2://energy:<STRONG_POSTGRES_PASSWORD>@postgres:5432/energy' | docker secret create backend_database_url -
```

Перевірка:

```bash
docker secret ls
```

## 4) Деплой stack

```bash
docker stack deploy -c deploy/swarm/stack.yml energy
```

Перевірка:

```bash
docker stack services energy
docker stack ps energy
```

## 5) Перевірити що секрети реально підключені

```bash
docker service inspect energy_backend --format '{{json .Spec.TaskTemplate.ContainerSpec.Secrets}}'
docker service inspect energy_postgres --format '{{json .Spec.TaskTemplate.ContainerSpec.Secrets}}'
docker service inspect energy_grafana --format '{{json .Spec.TaskTemplate.ContainerSpec.Secrets}}'
```

## 6) Ротація секретів (safe rollout)

Swarm не дозволяє оновити secret in-place. Схема:

1. Створити новий секрет з новим ім'ям (наприклад `postgres_password_v2`).
2. Оновити `stack.yml` на нове ім'я секрета.
3. `docker stack deploy -c ... energy`.
4. Переконатися, що сервіси healthy.
5. Видалити старий секрет:

```bash
docker secret rm <old_secret_name>
```

## 7) Мінімальний hardening checklist

- використовуйте окремі секрети для `dev/stage/prod`;
- не запускайте продові паролі через shell history/shared terminals;
- обмежте доступ до manager нод;
- додайте TLS для Traefik entrypoints і реальні домени (не `localhost`);
- бажано перейти на image tags з версіями (`:2026-05-02-1`), а не `:latest`.

