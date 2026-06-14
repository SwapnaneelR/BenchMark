# Docker Swarm Deployment

Demonstrates horizontal scaling of the BenchMark platform across multiple nodes.
Stateless services (api, observability, frontend) scale to 2+ replicas.
Worker scales with a co-located docker-daemon sidecar per worker node.

## Single-node quick start

```bash
# 1. Init swarm (one-time)
docker swarm init

# 2. Label the node as a worker node (needed for worker + docker-daemon placement)
docker node update --label-add role=worker $(docker node ls -q)

# 3. Build and push images (or use local registry)
export REGISTRY=registry.local:5000
docker compose -f ../../docker-compose.yml build
docker compose -f ../../docker-compose.yml push

# 4. Deploy the stack
docker stack deploy \
  --compose-file docker-stack.yml \
  --with-registry-auth \
  benchmark

# 5. Verify all services are running
docker service ls
docker stack ps benchmark
```

## Multi-node setup

```bash
# On manager node:
docker swarm init --advertise-addr <MANAGER_IP>

# Copy the join token, then on each worker node:
docker swarm join --token <WORKER_TOKEN> <MANAGER_IP>:2377

# Label each worker node for DinD placement:
docker node update --label-add role=worker <WORKER_NODE_ID>

# For shared submissions volume, configure NFS in docker-stack.yml:
# Uncomment the driver_opts block under the submissions volume definition.

# Deploy:
docker stack deploy -c docker-stack.yml benchmark
```

## Scaling commands

```bash
# Scale api to 4 replicas (zero-downtime rolling update):
docker service scale benchmark_api=4

# Scale frontend to 3 replicas:
docker service scale benchmark_frontend=3

# Scale worker to 3 replicas (add a third worker node first, label it):
docker service scale benchmark_worker=3
docker service scale benchmark_docker-daemon=3

# Check rolling update status:
docker service ps benchmark_api
```

## Update (rolling deploy)

```bash
# After building new images:
docker stack deploy -c docker-stack.yml benchmark
# Swarm performs rolling update per update_config in the stack file.
```

## Teardown

```bash
docker stack rm benchmark
docker swarm leave --force   # single-node only
```
