# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATABASE_PATH=/app/.data/arena.sqlite
# tsx is the existing server runner. Keep its build-installed dependencies;
# no compiler or package registry is contacted when the container starts.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/auth ./auth
COPY --from=build --chown=node:node /app/admin ./admin
COPY --from=build --chown=node:node /app/submissions ./submissions
COPY --from=build --chown=node:node /app/video-pull-up/src ./video-pull-up/src
COPY --from=build --chown=node:node /app/video-pull-up/data ./video-pull-up/data
COPY --from=build --chown=node:node /app/video-pull-up/client ./video-pull-up/client
COPY --from=build --chown=node:node /app/qa/viscon_qa ./qa/viscon_qa
COPY --from=build --chown=node:node /app/qa/requirements.txt ./qa/requirements.txt
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/scripts/check-deployment.mjs ./scripts/check-deployment.mjs
RUN mkdir -p .data lectures qa/data video-pull-up/media && chown -R node:node .data lectures qa/data video-pull-up/media
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/health',{signal:AbortSignal.timeout(4000)}).then(async r=>{if(!r.ok||!(await r.json()).ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts"]

# Optional target: the default image needs no Python or model key.
# Debian Bookworm supplies Python 3.11, compatible with the existing Q&A module.
FROM runtime AS qa-runtime
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/qa-venv && /opt/qa-venv/bin/pip install --no-cache-dir -r /app/qa/requirements.txt
ENV QA_PYTHON=/opt/qa-venv/bin/python
USER node
