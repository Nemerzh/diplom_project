# Multi-Node Demo Plan: Docker Swarm (Multipass VMs) + Kubernetes (kind)

## 1. Goal

Build a local environment that demonstrates the **same application** deployed on two orchestrators side-by-side:

- **Docker Swarm** running on real multi-node VMs (hard requirement).
- **Kubernetes** running as a multi-node cluster via `kind` (logical multi-node, single-host).

Both clusters live on the same Windows host, share a single application codebase, and can be brought up/down independently. Designed to be presented **one at a time** with a brief side-by-side moment in the middle.

The plan is intentionally scoped for a **16 GB RAM Windows machine** with Hyper-V enabled and Docker Desktop installed.

---

## 2. Architecture Summary

```
┌─ Windows host (16 GB) ───────────────────────────────────────┐
│                                                              │
│  Docker Desktop (WSL2 backend)                               │
│    └── kind cluster: 1 control-plane + 2 workers             │
│        (containers acting as K8s nodes)                      │
│                                                              │
│  Hyper-V (via Multipass)                                     │
│    ├── node-1   (Ubuntu 24.04 + Docker)  swarm manager       │
│    ├── node-2   (Ubuntu 24.04 + Docker)  swarm worker        │
│    └── node-3   (Ubuntu 24.04 + Docker)  swarm worker        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Resource budget:**

| Component | RAM |
|---|---|
| Windows + browser + IDE | ~9 GB |
| Docker Desktop (4 GB cap) | ~3 GB active |
| 3 × Multipass VMs (1.5 GB each) | ~4.5 GB |
| kind 3-node cluster | ~2 GB (within Docker Desktop) |
| **Total when both clusters up** | **~16 GB (tight but feasible)** |

**Operating modes:**
- *Sequential (default):* only one cluster running at a time.
- *Concurrent:* both up briefly during the live side-by-side demo, then tear down promptly.

---

## 3. Prerequisites

Install on the Windows host (one-time):

| Tool | Purpose | Install command |
|---|---|---|
| Docker Desktop | Host Docker daemon for kind | https://docs.docker.com/desktop/install/windows-install/ |
| Multipass | Ubuntu VMs on Hyper-V | `winget install Canonical.Multipass` |
| kind | Local Kubernetes | `winget install Kubernetes.kind` |
| kubectl | K8s CLI | `winget install Kubernetes.kubectl` |
| Git Bash or WSL | Run shell scripts | already present if WSL is enabled |
| Make (optional) | Run `make` targets | `winget install GnuWin32.Make` or use WSL |

**Verify Hyper-V is available:**

```powershell
systeminfo | findstr /C:"Hyper-V"
# expected: "A hypervisor has been detected. Features required for Hyper-V will not be displayed."
```

**Configure Docker Desktop limits** (Settings → Resources):
- Memory: **4 GB**
- CPUs: **2–3**
- Disk image size: default

Sufficient for the kind cluster; leaves headroom for VMs.

---

## 4. Repository Layout

The whole demo lives under `infra/local/` so it is portable to any project.

```
.
├── infra/
│   └── local/
│       ├── multipass/
│       │   ├── cloud-init.yaml          # Ubuntu provisioning (installs Docker)
│       │   └── up.sh                    # Launches the 3 VMs
│       ├── swarm/
│       │   ├── setup.sh                 # docker swarm init + join
│       │   └── teardown.sh              # docker swarm leave + stop VMs
│       ├── kind/
│       │   ├── cluster.yaml             # 3-node kind config
│       │   ├── up.sh                    # kind create cluster + load image
│       │   └── down.sh                  # kind delete cluster
│       └── README.md                    # Quick reference
├── deploy/
│   ├── stack.yml                        # Swarm stack definition
│   └── k8s/
│       ├── deployment.yaml              # K8s deployment
│       ├── service.yaml                 # K8s service (NodePort)
│       └── kustomization.yaml
├── app/                                 # The sample application
│   ├── Dockerfile
│   └── ...
└── Makefile                             # Top-level orchestration
```

---

## 5. VM Bootstrap (Multipass + cloud-init)

### 5.1 `infra/local/multipass/cloud-init.yaml`

Provisions each VM identically: installs Docker, configures the daemon, adds the `ubuntu` user to the `docker` group.

```yaml
#cloud-config
package_update: true
package_upgrade: false
packages:
  - ca-certificates
  - curl
  - jq

write_files:
  - path: /etc/docker/daemon.json
    content: |
      {
        "log-driver": "json-file",
        "log-opts": { "max-size": "20m", "max-file": "3" },
        "live-restore": true
      }

runcmd:
  - curl -fsSL https://get.docker.com | sh
  - usermod -aG docker ubuntu
  - systemctl enable --now docker
  - systemctl restart docker
  - sysctl -w net.ipv4.ip_forward=1
  - echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
```

### 5.2 `infra/local/multipass/up.sh`

Idempotent VM launcher. Skips VMs that already exist.

```bash
#!/usr/bin/env bash
set -euo pipefail

NODES=("node-1" "node-2" "node-3")
CPUS="${VM_CPUS:-1}"
MEMORY="${VM_MEMORY:-1500M}"
DISK="${VM_DISK:-8G}"
IMAGE="${VM_IMAGE:-24.04}"
CLOUD_INIT="$(dirname "$0")/cloud-init.yaml"

for node in "${NODES[@]}"; do
  if multipass info "$node" >/dev/null 2>&1; then
    echo "[$node] already exists, ensuring it is started"
    multipass start "$node" || true
  else
    echo "[$node] launching..."
    multipass launch \
      --name "$node" \
      --cpus "$CPUS" \
      --memory "$MEMORY" \
      --disk "$DISK" \
      --cloud-init "$CLOUD_INIT" \
      "$IMAGE"
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
```

### 5.3 Useful Multipass operations

```bash
multipass list                          # show VMs and IPs
multipass shell node-1                  # interactive shell
multipass exec node-1 -- <cmd>          # one-off command
multipass stop node-1 node-2 node-3     # pause (frees RAM, keeps state)
multipass start node-1 node-2 node-3    # resume
multipass delete node-1 && multipass purge  # destroy
```

---

## 6. Docker Swarm Setup

### 6.1 `infra/local/swarm/setup.sh`

Initializes the swarm using `node-1` as manager, joins `node-2` and `node-3` as workers, labels nodes by role.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Resolve manager IP (private VPC-style IP from Multipass)
MGR_IP=$(multipass info node-1 --format json \
  | jq -r '.info."node-1".ipv4[0]')

if [[ -z "$MGR_IP" || "$MGR_IP" == "null" ]]; then
  echo "ERROR: could not resolve node-1 IP" >&2
  exit 1
fi

echo "Manager IP: $MGR_IP"

# Init swarm if not already initialized
if ! multipass exec node-1 -- docker info 2>/dev/null \
     | grep -q "Swarm: active"; then
  multipass exec node-1 -- docker swarm init --advertise-addr "$MGR_IP"
else
  echo "Swarm already initialized on node-1"
fi

# Get worker join token
TOKEN=$(multipass exec node-1 -- docker swarm join-token -q worker)

# Join workers
for node in node-2 node-3; do
  if multipass exec "$node" -- docker info 2>/dev/null \
       | grep -q "Swarm: active"; then
    echo "[$node] already in swarm"
  else
    echo "[$node] joining swarm..."
    multipass exec "$node" -- docker swarm join \
      --token "$TOKEN" "${MGR_IP}:2377"
  fi
done

# Label nodes
multipass exec node-1 -- docker node update --label-add role=app node-1 >/dev/null
multipass exec node-1 -- docker node update --label-add role=app node-2 >/dev/null
multipass exec node-1 -- docker node update --label-add role=app node-3 >/dev/null

echo
multipass exec node-1 -- docker node ls
```

### 6.2 `infra/local/swarm/teardown.sh`

Leaves swarm on every node; optionally stops VMs to free RAM.

```bash
#!/usr/bin/env bash
set -euo pipefail

for node in node-3 node-2 node-1; do
  if multipass info "$node" >/dev/null 2>&1; then
    multipass exec "$node" -- docker swarm leave --force 2>/dev/null || true
    echo "[$node] left swarm"
  fi
done

# Free RAM by pausing VMs (state is kept on disk for next start)
if [[ "${KEEP_RUNNING:-0}" != "1" ]]; then
  multipass stop node-1 node-2 node-3
  echo "VMs stopped"
fi
```

### 6.3 Sample Stack File: `deploy/stack.yml`

A minimal but production-shaped stack (replace the image with your app):

```yaml
version: "3.9"

services:
  api:
    image: ${REGISTRY:-localhost:5000}/myapp:${IMAGE_TAG:?set IMAGE_TAG}
    networks: [web]
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        order: start-first
        failure_action: rollback
        delay: 5s
      restart_policy:
        condition: on-failure
      resources:
        limits: { cpus: '0.5', memory: 256M }
      placement:
        max_replicas_per_node: 1
        constraints: [node.labels.role == app]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 15s
    ports:
      - target: 8080
        published: 8080
        mode: ingress

networks:
  web:
    driver: overlay
```

### 6.4 Image distribution to swarm nodes

Inner Multipass VMs cannot pull from `localhost` of the host. Two simple options:

**Option A — Save / load (fast, no registry):**

```bash
docker build -t myapp:dev ./app
docker save myapp:dev > /tmp/myapp.tar
for node in node-1 node-2 node-3; do
  multipass transfer /tmp/myapp.tar "$node:/tmp/myapp.tar"
  multipass exec "$node" -- docker load -i /tmp/myapp.tar
done
```

**Option B — Local registry on the swarm:**

```bash
multipass exec node-1 -- docker service create \
  --name registry --publish 5000:5000 \
  --constraint 'node.role==manager' registry:2

# On host, push to manager's IP
docker tag myapp:dev "${MGR_IP}:5000/myapp:dev"
docker push "${MGR_IP}:5000/myapp:dev"
```

Document only one in your script — Option A is simpler for a demo.

### 6.5 Deploy / verify / rollback

```bash
# Copy stack file in
multipass transfer deploy/stack.yml node-1:/home/ubuntu/stack.yml

# Deploy
multipass exec node-1 -- bash -c \
  "IMAGE_TAG=dev docker stack deploy -c /home/ubuntu/stack.yml myapp"

# Watch
multipass exec node-1 -- docker stack services myapp
multipass exec node-1 -- docker service ps myapp_api

# Rollback
multipass exec node-1 -- docker service rollback myapp_api
```

App is reachable at `http://<node-1-IP>:8080` thanks to swarm's routing mesh.

---

## 7. Kubernetes (kind) Setup

### 7.1 `infra/local/kind/cluster.yaml`

3-node K8s cluster with a host-port mapping for easy browser access.

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: myapp
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080
        hostPort: 8080
        protocol: TCP
  - role: worker
  - role: worker
```

### 7.2 `infra/local/kind/up.sh`

Creates the cluster, builds the app image on the host, loads it into kind, and applies manifests.

```bash
#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="myapp"
CONFIG="$(dirname "$0")/cluster.yaml"
IMAGE="myapp:dev"

if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  echo "Cluster '${CLUSTER_NAME}' already exists"
else
  kind create cluster --name "$CLUSTER_NAME" --config "$CONFIG"
fi

# Build and load the app image
docker build -t "$IMAGE" ./app
kind load docker-image "$IMAGE" --name "$CLUSTER_NAME"

# Apply manifests
kubectl --context "kind-${CLUSTER_NAME}" apply -k deploy/k8s/

kubectl --context "kind-${CLUSTER_NAME}" get nodes
kubectl --context "kind-${CLUSTER_NAME}" rollout status deployment/myapp-api
```

### 7.3 `infra/local/kind/down.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="myapp"

if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  kind delete cluster --name "$CLUSTER_NAME"
else
  echo "Cluster '${CLUSTER_NAME}' not present"
fi
```

### 7.4 K8s manifests

`deploy/k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-api
spec:
  replicas: 3
  selector:
    matchLabels: { app: myapp-api }
  template:
    metadata:
      labels: { app: myapp-api }
    spec:
      containers:
        - name: api
          image: myapp:dev
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet: { path: /health, port: 8080 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            limits: { cpu: "500m", memory: "256Mi" }
            requests: { cpu: "100m", memory: "64Mi" }
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels: { app: myapp-api }
```

`deploy/k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-api
spec:
  type: NodePort
  selector:
    app: myapp-api
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080
```

`deploy/k8s/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
```

Reachable at `http://localhost:8080` thanks to the kind port mapping.

---

## 8. Top-Level Makefile

Single entry point for the entire demo lifecycle.

```makefile
SHELL := /bin/bash

.PHONY: help vms-up vms-stop vms-destroy \
        swarm-up swarm-down swarm-deploy swarm-logs \
        kind-up kind-down kind-deploy kind-logs \
        demo-up demo-down clean

help:           ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ── VM lifecycle ────────────────────────────────────────────────
vms-up:         ## Launch / start all Multipass VMs
	bash infra/local/multipass/up.sh

vms-stop:       ## Pause all VMs (frees RAM, keeps state)
	multipass stop node-1 node-2 node-3

vms-destroy:    ## Permanently delete all VMs
	-multipass delete node-1 node-2 node-3
	multipass purge

# ── Swarm ───────────────────────────────────────────────────────
swarm-up: vms-up  ## Bring up VMs and initialize swarm
	bash infra/local/swarm/setup.sh

swarm-deploy:   ## Deploy the app stack to the swarm
	docker build -t myapp:dev ./app
	docker save myapp:dev > /tmp/myapp.tar
	for n in node-1 node-2 node-3; do \
	  multipass transfer /tmp/myapp.tar $$n:/tmp/myapp.tar; \
	  multipass exec $$n -- docker load -i /tmp/myapp.tar; \
	done
	multipass transfer deploy/stack.yml node-1:/home/ubuntu/stack.yml
	multipass exec node-1 -- bash -c \
	  "IMAGE_TAG=dev docker stack deploy -c /home/ubuntu/stack.yml myapp"
	multipass exec node-1 -- docker stack services myapp

swarm-logs:     ## Tail swarm service logs
	multipass exec node-1 -- docker service logs -f myapp_api

swarm-down:     ## Tear down swarm and stop VMs
	bash infra/local/swarm/teardown.sh

# ── kind ────────────────────────────────────────────────────────
kind-up:        ## Create kind cluster and deploy app
	bash infra/local/kind/up.sh

kind-deploy:    ## Rebuild image and re-apply manifests
	docker build -t myapp:dev ./app
	kind load docker-image myapp:dev --name myapp
	kubectl --context kind-myapp apply -k deploy/k8s/
	kubectl --context kind-myapp rollout status deployment/myapp-api

kind-logs:      ## Tail K8s deployment logs
	kubectl --context kind-myapp logs -f deployment/myapp-api

kind-down:      ## Delete kind cluster
	bash infra/local/kind/down.sh

# ── Combined ────────────────────────────────────────────────────
demo-up:    swarm-up swarm-deploy kind-up  ## Both clusters up (RAM-heavy)
demo-down:  kind-down swarm-down           ## Tear everything down

clean: demo-down vms-destroy               ## Full reset
```

---

## 9. Demo Choreography

Recommended live presentation flow:

1. **Open with kind** (lighter, instant).
   ```bash
   make kind-up
   kubectl --context kind-myapp get nodes -o wide
   kubectl --context kind-myapp get pods -o wide
   ```
   *Talking point:* "3 nodes, real K8s API, kubelet on each. Nodes happen to be containers — same manifests would deploy on EKS/GKE unchanged."

2. **Show the K8s app** at `http://localhost:8080`.

3. **In a second terminal**, kick off swarm in the background:
   ```bash
   make swarm-up swarm-deploy
   ```
   While it provisions (~60–90 seconds), continue talking through K8s features.

4. **Switch to swarm** once `docker node ls` shows 3 ready nodes:
   ```bash
   multipass exec node-1 -- docker node ls
   multipass exec node-1 -- docker stack services myapp
   ```
   *Talking point:* "Real VMs, real overlay network across hosts, same container image."

5. **Side-by-side moment** — split terminal:
   - Left: `kubectl --context kind-myapp get pods -o wide`
   - Right: `multipass exec node-1 -- docker service ps myapp_api`

6. **Tear down** at end:
   ```bash
   make demo-down
   ```

If RAM is critical, run **only one cluster at a time** and explain the symmetry verbally rather than visually.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `multipass launch` hangs | Ensure Hyper-V is enabled and Docker Desktop's WSL2 integration isn't fighting Hyper-V. Reboot if needed. |
| Multipass VM has no IP | `multipass restart <name>`; check Hyper-V virtual switch (`Default Switch`). |
| Swarm join times out | Ensure VMs are on the same Multipass network; use the **private** IP from `multipass info`. |
| `kind create cluster` fails on Docker Desktop | Increase Docker Desktop memory to ≥4 GB; ensure WSL2 backend is selected. |
| `kind load docker-image` says "image not found" | Build the image first with `docker build -t myapp:dev .`. |
| App not reachable on `localhost:8080` (kind) | Confirm `extraPortMappings` in `cluster.yaml` matches the `nodePort` of the Service. |
| App not reachable on swarm node IP | Check firewall on the VM (`sudo ufw status`); routing mesh needs `2377/tcp`, `7946/tcp+udp`, `4789/udp`. |
| Both clusters running, host swapping | Stop one: `make swarm-down` or `make kind-down`. |
| Swarm rolling update stuck | Check healthcheck — without one, swarm can't progress; see `docker service ps --no-trunc <svc>`. |

---

## 11. Migration Path to Real Cloud (DigitalOcean)

The same artifacts deploy unchanged on cloud VMs:

1. Provision 3 DigitalOcean droplets (Ubuntu 24.04) inside a VPC.
2. Run the **same `cloud-init.yaml`** as user-data at droplet creation.
3. Run the **same `swarm/setup.sh`** (with hostnames swapped from Multipass IPs to droplet private IPs).
4. The **same `stack.yml`** deploys to the cluster.

For K8s on real VMs, swap `kind` for **k3s** — single command per node, same `deploy/k8s/` manifests apply unchanged:

```bash
# On the K8s server VM
curl -sfL https://get.k3s.io | sh -

# On each agent VM
curl -sfL https://get.k3s.io \
  | K3S_URL=https://<server-ip>:6443 K3S_TOKEN=<token> sh -
```

The kind→k3s switch is a deploy-time concern; nothing in the application changes.

---

## 12. Implementation Checklist

Step-by-step for the new project repo:

- [ ] Verify Hyper-V available (`systeminfo | findstr Hyper-V`).
- [ ] Install Multipass, kind, kubectl, Docker Desktop.
- [ ] Set Docker Desktop to 4 GB RAM, 2–3 CPUs.
- [ ] Create `infra/local/` directory structure.
- [ ] Add `multipass/cloud-init.yaml` and `multipass/up.sh`.
- [ ] Add `swarm/setup.sh` and `swarm/teardown.sh`.
- [ ] Add `kind/cluster.yaml`, `kind/up.sh`, `kind/down.sh`.
- [ ] Add `deploy/stack.yml` with the chosen app image.
- [ ] Add `deploy/k8s/` (deployment, service, kustomization).
- [ ] Add top-level `Makefile`.
- [ ] `chmod +x infra/local/**/*.sh` (or use `bash <script>` in WSL/Git Bash).
- [ ] Test cycle: `make swarm-up swarm-deploy` → verify → `make swarm-down`.
- [ ] Test cycle: `make kind-up` → verify → `make kind-down`.
- [ ] Practice the concurrent demo flow once before presenting.

---

## 13. One-Page Quick Reference

```
# First-time setup
make vms-up                # 3 Ubuntu VMs ready (~90 sec)

# Swarm demo
make swarm-up              # init swarm across VMs
make swarm-deploy          # build + load + deploy stack
# → http://<node-1-ip>:8080
make swarm-down            # leave swarm + stop VMs

# kind demo
make kind-up               # create cluster + deploy app
# → http://localhost:8080
make kind-down             # delete cluster

# Both at once (live demo only)
make demo-up
make demo-down

# Full reset
make clean
```
