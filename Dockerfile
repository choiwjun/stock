# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS dependencies
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install --no-install-recommends -y tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=development \
    PORT=4173
COPY --from=dependencies --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
EXPOSE 4173
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/app/server.js"]
