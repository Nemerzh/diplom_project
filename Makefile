# Локальний оркестратор: Multipass + Swarm, kind + K8s.
# Windows PowerShell: немає bash у PATH → задайте Git Bash, напр.:
#   set GIT_BASH=C:\Program Files\Git\bin\bash.exe
#   make swarm-up
# Або відкрийте термінал «Git Bash» у каталозі проєкту.
ifeq ($(OS),Windows_NT)
  GIT_BASH ?= "C:/Program Files/Git/bin/bash.exe"
else
  GIT_BASH ?= bash
endif

ROOT := $(CURDIR)

.PHONY: help build-images \
	vms-up vms-stop vms-destroy \
	swarm-fix-docker \
	swarm-up swarm-down swarm-ensure-repo swarm-sync-repo-tar swarm-mount swarm-unmount \
	swarm-load-images swarm-secrets swarm-deploy-stack swarm-deploy \
	kind-up kind-down \
	demo-up demo-down clean

help: ## Довідка по цілях
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

build-images: ## Зібрати energy-backend / energy-frontend / energy-simulator
	docker build -t energy-backend:latest "$(ROOT)/services/backend"
	docker build -t energy-frontend:latest "$(ROOT)/services/frontend"
	docker build -t energy-simulator:latest "$(ROOT)/services/simulator"

vms-up: ## Підняти 3 VM Multipass (node-1 … node-3)
	$(GIT_BASH) "$(ROOT)/infra/local/multipass/up.sh"

vms-stop: ## Зупинити VM (звільняє RAM)
	multipass stop node-1 node-2 node-3 || true

vms-destroy: ## Видалити VM
	-multipass delete node-1 node-2 node-3
	multipass purge

swarm-fix-docker: ## Підготувати Docker на VM до Swarm (прибрати live-restore; один раз на старих інстансах)
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/fix-docker-daemon-for-swarm.sh"

swarm-up: vms-up ## VM + docker swarm init/join
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/setup.sh"

swarm-down: ## Покинути swarm і зупинити VM
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/teardown.sh"

swarm-ensure-repo: ## Репо на node-1: mount (або SYNC_REPO_WITH_TAR=1 для копії без mount)
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/ensure-repo-on-manager.sh"

swarm-sync-repo-tar: ## Лише tar-копія репо на node-1 (якщо mount вимкнено)
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/sync-repo-tar.sh"

swarm-mount: ## Змонтувати репозиторій у node-1 (лише mount; для повного деплою краще swarm-ensure-repo)
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/mount-repo.sh"

swarm-unmount: ## Відмонтувати репозиторій на node-1
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/unmount-repo.sh"

swarm-load-images: build-images ## docker save/load образів на всі ноди
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/load-images.sh"

swarm-secrets: ## Створити демо-secrets на manager (node-1)
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/create-demo-secrets.sh"

swarm-deploy-stack: ## docker stack deploy energy (після репо, образів, секретів)
	$(GIT_BASH) "$(ROOT)/infra/local/swarm/deploy-stack.sh"

swarm-deploy: swarm-ensure-repo swarm-load-images swarm-secrets swarm-deploy-stack ## Повний деплой stack energy

kind-up: build-images ## kind-кластер energy + маніфести + міграції
	$(GIT_BASH) "$(ROOT)/infra/local/kind/up.sh"

kind-down: ## Видалити kind-кластер energy
	$(GIT_BASH) "$(ROOT)/infra/local/kind/down.sh"

demo-up: swarm-up swarm-deploy kind-up ## Обидва кластери (RAM++)

demo-down: kind-down swarm-down ## Зупинити kind і swarm VM

clean: demo-down vms-destroy ## Повний скидок VM (осторожно)
