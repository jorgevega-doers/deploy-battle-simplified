# Imagen del modo online (Render). Construye el frontend con Vite y arranca el servidor con ONLINE=1.
FROM node:24-trixie-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production ONLINE=1 PORT=3000 DB_PATH=:memory: TUNNEL=0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY assets ./assets
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
