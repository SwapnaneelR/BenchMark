# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# BuildKit cache mount: npm cache lives outside the overlay layer → no disk cost during build
RUN --mount=type=cache,target=/root/.npm \
    npm install
COPY . .
ARG API_URL=http://api:3000
ARG OBS_URL=http://observability:3002
ENV API_URL=$API_URL
ENV OBS_URL=$OBS_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p public
RUN --mount=type=cache,target=/root/.npm \
    npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
RUN mkdir -p public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# node_modules from builder stage NOT copied — standalone bundle is self-contained (~50MB vs ~500MB)
USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
