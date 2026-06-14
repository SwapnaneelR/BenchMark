# BenchMark — Matching Engine Benchmark Platform

Teams submit a Docker image exposing a WebSocket server on port 9000. The platform runs correctness and load tests, then scores and ranks each submission.

## Quick Start

```bash
docker compose up --build
```

| Service       | URL                             |
|---------------|---------------------------------|
| Frontend UI   | http://localhost                |
| API           | http://localhost/api            |
| Observability | http://localhost/admin          |

> **Linux users:** uncomment `extra_hosts` in `docker-compose.yml` for the worker service before starting.
> 
> **Security note:** worker builds and runs submission containers through an internal Docker daemon service instead of mounting the host Docker socket directly.
> 
> Note: those submission containers are created inside the internal `docker-daemon` service and are not visible in your host Docker Desktop container list.
> They are also removed after each benchmark run completes.

## Submitting an Engine

**Via the UI** — open `http://localhost`, go to the `[./submit]` tab, enter your team name, upload a `.zip` file, and click `[ ./submit --run ]`.

**Via curl:**
```bash
curl -X POST -F "file=@engine.zip" \
  "http://localhost/api/submit?team=yourteam"
```

### Zip requirements
- `Dockerfile` must be at the **root** of the zip (or one level deep in a single folder)
- The container must listen for WebSocket connections on **port 9000**
- See [PROTOCOL.md](PROTOCOL.md) for the full message contract

## Scoring

```
score = round((correctness × 0.6 + latency_score × 0.4) × 1000)   max = 1000
```

- **Correctness** — 200 serial orders validated against the reference engine (fill qty + value must match)
- **Latency** — p99 target is <10 ms; score degrades linearly above that

## Sample Engine

A reference implementation is in `sample-engine/`. Use it as a starting point or to verify the platform is working end-to-end:

```bash
cd sample-engine
npm install
npm run dev        # WebSocket server on ws://localhost:9000
```

To submit the sample engine:
```bash
cd sample-engine
zip -r ../sample.zip .
curl -X POST -F "file=@../sample.zip" \
  "http://localhost/api/submit" \
  -H "X-Team-Id: sample"
```

## Live Logs

The `[./logs]` tab shows live events streamed from every active benchmark run — order acks, fill events, scores, and errors — refreshed every 2 seconds. Filter by run ID or log level.
