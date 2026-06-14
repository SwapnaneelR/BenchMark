# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
COPY services/observability/package.json ./package.json
COPY services/observability/tsconfig.json ./tsconfig.json
COPY services/observability/src ./src
RUN --mount=type=cache,target=/root/.npm npm install
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3002
CMD ["node", "dist/index.js"]
