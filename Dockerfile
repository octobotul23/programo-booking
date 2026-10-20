# Programo: one small container with the API and the built app. Build: docker compose build
# Data (database + encryption key) lives in the /data volume, never in the image.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: no package gets to run install scripts on the build machine
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY vite.config.js ./
COPY client ./client
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
# runs as the unprivileged "node" user, not root
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{process.exitCode=r.ok?0:1;return r.text()},()=>{process.exitCode=1})"
CMD ["node", "server/index.js"]
