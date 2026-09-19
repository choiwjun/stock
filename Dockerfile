FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=development \
    PORT=4173
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node node_modules ./node_modules
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
EXPOSE 4173
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "src/app/server.js"]
