# syntax=docker/dockerfile:1

# ── Stage 1: compile fleet binary ─────────────────────────────────────────────
# Use plain alpine (7MB) instead of node:20-alpine (150MB) — we only need C++ tools here
FROM alpine:3.19 AS fleet-builder
# boost-static provides .a libs for static linking → no boost-libs needed in runtime image
RUN apk add --no-cache cmake make g++ boost-dev boost-static
WORKDIR /fleet
COPY services/fleet/ .
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build -j$(nproc) && \
    strip build/fleet

# ── Stage 2: compile TypeScript worker ────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package.json tsconfig.base.json ./
COPY packages/protocol/package.json          packages/protocol/package.json
COPY services/api/package.json               services/api/package.json
COPY services/worker/package.json            services/worker/package.json
COPY services/observability/package.json     services/observability/package.json
COPY services/frontend/package.json          services/frontend/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm install -w @iicpc/protocol -w @iicpc/worker

COPY packages/protocol packages/protocol
COPY services/worker   services/worker

RUN npm run build -w @iicpc/protocol
RUN npm run build -w @iicpc/worker

# ── Stage 3: minimal runtime image ────────────────────────────────────────────
FROM node:20-alpine
# docker-cli only — no boost-libs needed (fleet binary is statically linked)
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY --from=fleet-builder /fleet/build/fleet /usr/local/bin/fleet
COPY --from=builder /app/node_modules                    ./node_modules
COPY --from=builder /app/packages/protocol/dist          ./packages/protocol/dist
COPY --from=builder /app/packages/protocol/package.json  ./packages/protocol/package.json
COPY --from=builder /app/services/worker/dist            ./services/worker/dist
COPY --from=builder /app/services/worker/package.json    ./services/worker/package.json
CMD ["node", "services/worker/dist/index.js"]
