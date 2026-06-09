# IICPC Order Book Benchmark

Competition platform for high-performance order book engines. Teams submit a Docker image exposing a WebSocket server; the platform benchmarks it for latency and correctness.

## Quick Start

```bash
cp .env.example .env
docker-compose up --build
```

| Service    | URL                        |
|------------|----------------------------|
| API        | http://localhost:3000      |
| Leaderboard| http://localhost:5173      |

## Submit an Engine

```bash
# submit a zip containing your Dockerfile + src
curl -X POST "http://localhost:3000/submit?team=myteam" \
  -F "file=@submission.zip"
```

The zip must contain a `Dockerfile` at its root. The container must expose a WebSocket server on port **9000**. See [PROTOCOL.md](PROTOCOL.md) for the message contract.

## Local Development

```bash
npm install
npm run dev:api       # API on :3000
npm run dev:worker    # BullMQ worker
npm run dev:frontend  # Leaderboard UI on :5173
```

## Test Your Engine Locally

```bash
cd sample-engine
npm install
npm run dev   # starts ws://localhost:9000
```
