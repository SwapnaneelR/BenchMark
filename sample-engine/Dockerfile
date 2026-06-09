# This Dockerfile is the contract — your submission must follow this pattern.
# Expose a WebSocket server on port 9000.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 9000
CMD ["node", "dist/server.js"]
