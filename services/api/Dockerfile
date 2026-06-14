FROM node:20-alpine AS builder
WORKDIR /app

# Copy root manifest + all workspace package.json stubs so npm resolves workspaces
COPY package.json tsconfig.base.json ./
COPY packages/protocol/package.json          packages/protocol/package.json
COPY services/api/package.json               services/api/package.json
COPY services/worker/package.json            services/worker/package.json
COPY services/observability/package.json     services/observability/package.json
COPY services/frontend/package.json          services/frontend/package.json

# Install only what api + protocol need (avoids pulling in Next.js / React etc.)
RUN --mount=type=cache,target=/root/.npm \
    npm install -w @iicpc/protocol -w @iicpc/api

# Copy source after install (better layer caching)
COPY packages/protocol packages/protocol
COPY services/api      services/api

RUN npm run build -w @iicpc/protocol
RUN npm run build -w @iicpc/api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules                    ./node_modules
COPY --from=builder /app/packages/protocol/dist          ./packages/protocol/dist
COPY --from=builder /app/packages/protocol/package.json  ./packages/protocol/package.json
COPY --from=builder /app/services/api/dist               ./services/api/dist
COPY --from=builder /app/services/api/package.json       ./services/api/package.json
EXPOSE 3000
CMD ["node", "services/api/dist/index.js"]
