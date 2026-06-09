FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY services/api ./services/api
RUN npm install --workspace=@iicpc/protocol --workspace=@iicpc/api
RUN npm run build --workspace=@iicpc/protocol
RUN npm run build --workspace=@iicpc/api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/protocol/dist ./packages/protocol/dist
COPY --from=builder /app/packages/protocol/package.json ./packages/protocol/package.json
COPY --from=builder /app/services/api/dist ./services/api/dist
COPY --from=builder /app/services/api/package.json ./services/api/package.json
EXPOSE 3000
CMD ["node", "services/api/dist/index.js"]
