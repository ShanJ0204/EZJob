FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY libs/common/package.json libs/common/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY libs/common libs/common

RUN npm run build --workspace @ezjob/common \
  && npm run build --workspace @ezjob/api

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY libs/common/package.json libs/common/package.json

RUN npm ci --omit=dev --workspace @ezjob/common --workspace @ezjob/api

COPY --from=builder /app/libs/common/dist libs/common/dist
COPY --from=builder /app/apps/api/dist apps/api/dist

WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
