FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY services/worker ./services/worker
RUN npm install --workspace=@iicpc/protocol --workspace=@iicpc/worker
RUN npm run build --workspace=@iicpc/protocol
RUN npm run build --workspace=@iicpc/worker

FROM node:20-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/protocol/dist ./packages/protocol/dist
COPY --from=builder /app/packages/protocol/package.json ./packages/protocol/package.json
COPY --from=builder /app/services/worker/dist ./services/worker/dist
COPY --from=builder /app/services/worker/package.json ./services/worker/package.json
CMD ["node", "services/worker/dist/index.js"]
