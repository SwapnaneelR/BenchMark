# Build C++ fleet binary on the same Alpine base as the runner so shared libs match.
FROM node:20-alpine AS fleet-builder
RUN apk add --no-cache cmake make g++ boost-dev
WORKDIR /fleet
COPY services/fleet/ .
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j$(nproc)

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy root manifest + all workspace package.json stubs so npm resolves workspaces
COPY package.json tsconfig.base.json ./
COPY packages/protocol/package.json          packages/protocol/package.json
COPY services/api/package.json               services/api/package.json
COPY services/worker/package.json            services/worker/package.json
COPY services/observability/package.json     services/observability/package.json
COPY services/frontend/package.json          services/frontend/package.json

RUN npm install -w @iicpc/protocol -w @iicpc/worker

COPY packages/protocol packages/protocol
COPY services/worker   services/worker

RUN npm run build -w @iicpc/protocol
RUN npm run build -w @iicpc/worker

FROM node:20-alpine
RUN apk add --no-cache docker-cli boost-libs
WORKDIR /app
COPY --from=fleet-builder /fleet/build/fleet /usr/local/bin/fleet
COPY --from=builder /app/node_modules                    ./node_modules
COPY --from=builder /app/packages/protocol/dist          ./packages/protocol/dist
COPY --from=builder /app/packages/protocol/package.json  ./packages/protocol/package.json
COPY --from=builder /app/services/worker/dist            ./services/worker/dist
COPY --from=builder /app/services/worker/package.json    ./services/worker/package.json
CMD ["node", "services/worker/dist/index.js"]
