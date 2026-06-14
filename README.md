# BenchMark — Matching Engine Benchmark Platform

Teams submit a Docker image exposing a WebSocket server on port 9000. The platform runs correctness and load tests, then scores and ranks each submission.

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

**Via the UI** — open `http://localhost`, enter team name, go to `[./submit]` tab, upload a `.zip` file, click `[ ./submit --run ]`.

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
score = round((correctness × 0.6 + latency_score × 0.4) × 1000)   max = 1000
```

- **Correctness** — 200 serial orders validated against reference engine (fill qty + value must match)
- **Latency** — p99 target <10 ms; score degrades linearly above that

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

Push to `main` → GitHub Actions auto-deploys to your server via SSH.

Required GitHub secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`.

See `.github/workflows/deploy.yml`.
