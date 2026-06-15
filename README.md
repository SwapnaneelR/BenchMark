# BenchMark — Matching Engine Benchmark Platform

Teams submit a Docker image exposing a WebSocket server on port 9000. The platform runs correctness and load tests, then scores and ranks each submission.

**Detailed design doc:** [Architecture & Design Document](https://docs.google.com/document/d/1FVPlFn_Ef-GYKc_hb9zGt6LIhEhLQe8nNuK-B1Tswso/edit?usp=sharing)

## Architecture

```
Internet / Browser
        │
        ▼
  ┌─────────────┐  :80 / :443
  │  Caddy Proxy │  (single public ingress)
  └──────┬───────┘
         │
   ┌─────┼──────────────────┐
   │     │                  │
   ▼     ▼                  ▼
/api/* /admin/*           /*
   │     │                  │
  API  Observability    Frontend
   │   (basic auth)     (Next.js)
   │
Worker ──► Docker Daemon (DinD)
   │              │
   │         Ephemeral submission containers
   │         (isolated --internal network per run)
   │
 Redis  (scores, teams, event stream — persisted volume)
```

**Networks:**
- `bench-infra` (internal): redis, api, worker, observability — no internet routing
- `bench-front`: proxy, api, observability, frontend
- `bench-docker` (internal): worker ↔ docker-daemon only

**Security:** worker connects to an internal Docker daemon (DinD) via TCP — host Docker socket is never mounted.

## Quick Start

```bash
docker compose up --build -d
```

| Who | URL | Auth |
|---|---|---|
| Participants | `http://localhost` | — |
| Admin | `http://localhost/admin/` | `admin` / `benchmark2026` |

> **Linux users:** uncomment `extra_hosts` in `docker-compose.yml` for the worker service.

> **Custom domain / HTTPS:** set `CADDY_HOST=yourdomain.com` in a `.env` file at repo root — Caddy auto-fetches a TLS cert via Let's Encrypt.

For full deployment instructions (cloud VM, AWS, password change): see [DEPLOY.md](DEPLOY.md).

## Submitting an Engine

**Via the UI** — open `http://localhost`, enter team name, go to `[./submit]` tab, upload a `.zip` file, set bot count (1–2000), click `[ ./submit --run ]`.

**Via curl:**
```bash
curl -X POST -F "file=@engine.zip" \
  "http://localhost/api/submit" \
  -H "X-Team-Id: yourteam"
```

### Zip requirements
- `Dockerfile` at the **root** of the zip (or one level deep in a single folder)
- Container must listen for WebSocket connections on **port 9000**
- See [PROTOCOL.md](PROTOCOL.md) for full message contract

## Scoring

```
score = round((correctness × 0.5 + latency_score × 0.3 + stability × 0.2) × 1000)   max = 1000
```

| Component | Weight | How measured |
|-----------|--------|--------------|
| **Correctness** | 50% | 200 serial orders validated against price-time priority reference engine; fill qty + value must match exactly |
| **Latency** | 30% | `max(0, 1 − p99_ms / 100)` — full marks at p99 < 0 ms, zero at ≥ 100 ms |
| **Stability** | 20% | `acks_received / orders_sent` during load test — measures connection reliability under concurrent load |

**Leaderboard columns:** RANK · TEAM · SCORE · PNL · CORRECTNESS · STABILITY · P50 · P99 · TPS · TIME

**Trade analytics** (PnL, volume, fills) are tracked and displayed per run but do **not** affect the score — they measure bot luck, not engine quality.

## Sample Engine

```bash
cd sample-engine-node
npm install
npm run dev        # WebSocket server on ws://localhost:9000
```

Submit it:
```bash
zip -r ../sample.zip sample-engine-node/
curl -X POST -F "file=@sample.zip" \
  "http://localhost/api/submit" \
  -H "X-Team-Id: sample"
```

## Live Logs

`[./logs]` tab shows live events for your team only — order acks, fills, scores, errors — refreshed every 2 seconds. Admin dashboard at `/admin/` shows all teams.

## CI/CD

Push to `main` → two-job GitHub Actions pipeline:

1. **build-and-push** (runs on GitHub's 14 GB runner) — builds all 4 service images and pushes to `ghcr.io`:
   - `ghcr.io/<owner>/benchmark-api:latest`
   - `ghcr.io/<owner>/benchmark-worker:latest`
   - `ghcr.io/<owner>/benchmark-observability:latest`
   - `ghcr.io/<owner>/benchmark-frontend:latest`

2. **deploy** — SSHes into the server, pulls the pre-built images, and restarts services. No build happens on the server — keeps disk usage low on small VMs.

Required GitHub secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`.

See `.github/workflows/deploy.yml`.

## Infrastructure as Code

**Docker Swarm** (multi-node production) — `infra/swarm/docker-stack.yml`:
```bash
docker swarm init
docker stack deploy -c infra/swarm/docker-stack.yml benchmark
docker service ls
```
Overlay networks, rolling updates, resource limits. Worker + DinD co-located via placement constraints.

See `infra/swarm/README.md` for full setup.
