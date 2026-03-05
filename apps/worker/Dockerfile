FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY libs/common/package.json libs/common/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY apps/worker apps/worker
COPY libs/common libs/common

RUN npm run build --workspace @ezjob/common \
  && npm run build --workspace @ezjob/worker

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ARG INSTALL_FETCHERS=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

RUN if [ "$INSTALL_FETCHERS" = "true" ]; then \
      pip3 install --no-cache-dir "scrapling[fetchers]"; \
    else \
      pip3 install --no-cache-dir scrapling; \
    fi

COPY package*.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY libs/common/package.json libs/common/package.json

RUN npm ci --omit=dev --workspace @ezjob/common --workspace @ezjob/worker

COPY --from=builder /app/libs/common/dist libs/common/dist
COPY --from=builder /app/apps/worker/dist apps/worker/dist

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
