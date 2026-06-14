# BenchMark — Deployment Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git

---

## First-time Setup

### 1. Clone the repo

```bash
git clone https://github.com/SwapnaneelR/BenchMark.git
cd BenchMark
```

### 2. Set the admin password

Generate a bcrypt hash for whatever password you want:

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'
```

Copy the output (starts with `$2a$`). Open `docker-compose.yml` and replace the `OBS_PASS_HASH` value:

```yaml
environment:
  OBS_USER: admin
  OBS_PASS_HASH: $$2a$$14$$<paste-your-hash-here>
```

> **Note:** Every `$` in the hash must be doubled (`$$`) inside docker-compose.yml.

### 3. Build and start

```bash
docker compose up --build -d
```

First build takes ~5–10 minutes (downloads base images, compiles TypeScript, builds Next.js).

### 4. Verify everything is up

```bash
docker compose ps
```

All 6 containers should show `Up`:

```
iicpc-proxy-1          Up   (ports 80, 443)
iicpc-frontend-1       Up
iicpc-api-1            Up
iicpc-worker-1         Up
iicpc-observability-1  Up
iicpc-redis-1          Up (healthy)
```

---

## Access URLs

| Who | URL | Notes |
|-----|-----|-------|
| Participants | `http://localhost` | Enter team name to join |
| Admin | `http://localhost/admin/` | Username: `admin`, Password: whatever you set |

---

## Participant Flow

1. Go to `http://localhost`
2. Enter team name → session created
3. **Submit** tab → upload engine ZIP + set bot count → submit
4. **Rank** tab → live leaderboard with scores
5. **Logs** tab → live run events for your team only

---

## Admin Flow

1. Go to `http://localhost/admin/`
2. Browser prompts for credentials → enter `admin` + your password
3. View live TPS, p99 latency, ack counts, full event log across all teams
4. Filter by Run ID, Bot ID, or log level

---

## Day-to-day Operations

### Stop everything
```bash
docker compose down
```
> Redis data (scores, teams) is persisted in a named volume — safe to stop.

### Start again (no rebuild)
```bash
docker compose up -d
```

### Restart a single service
```bash
docker compose restart api
```

### View logs
```bash
docker compose logs -f worker     # watch worker in real time
docker compose logs api           # dump api logs
```

### Wipe all data (scores, teams, submissions)
```bash
docker compose down -v            # removes volumes — irreversible
docker compose up -d
```

---

## Changing the Admin Password

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'newpassword'
```

Paste the new hash into `docker-compose.yml` (`OBS_PASS_HASH`), then:

```bash
docker compose up -d proxy
```

No rebuild needed — Caddy reloads config on container restart.

---

## Updating the Platform

```bash
git pull
docker compose up --build -d
```

Only services with changed source get rebuilt. Redis data is preserved.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `http://localhost` not loading | Check Docker Desktop is running → `docker compose ps` |
| `docker compose up` fails on build | Check internet connection (pulls base images) |
| Admin page shows 401 even with correct password | Make sure `$` signs are doubled in `OBS_PASS_HASH` in compose |
| Leaderboard empty after restart | Expected — empty until a team submits |
| Worker errors on submission | Check `docker compose logs worker` for build/run errors |
| Submission stuck in queue | Redis may have restarted mid-run → `docker compose restart worker` |

---

## Engine Contract (for participants)

Teams submit a ZIP file with a `Dockerfile` at the root. The engine must:

- Start a **WebSocket server on port 9000**
- Accept JSON frames: `NewLimit`, `NewMarket`, `Cancel`
- Reply with: `Ack`, `Fill`, `Reject`

Resource limits enforced per run: **1 CPU, 512 MB RAM, no internet access**.

See `PROTOCOL.md` for full message spec.
