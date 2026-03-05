# Deployment environment variable matrix

This matrix documents the minimum environment variables needed to run EZJob in production-like environments, grouped by service/runtime profile.

## Shared (API + Worker)

| Variable | Required | Default | Example production value | Secret? | Notes |
|---|---|---|---|---|---|
| `NODE_ENV` | Yes | `production` (recommended) | `production` | Non-secret | Set to `production` in deployed environments. |
| `DATABASE_URL` | Yes | None | `postgresql://ezjob:<strong-password>@postgres.internal:5432/ezjob?schema=public` | Secret | Contains DB credentials; treat as sensitive. |
| `REDIS_URL` | Yes | `redis://127.0.0.1:6379` (worker fallback) | `redis://redis.internal:6379` | Non-secret (usually) | If Redis auth/TLS is enabled, treat this value as secret. |

## API service

| Variable | Required | Default | Example production value | Secret? | Notes |
|---|---|---|---|---|---|
| `API_HOST` | Optional | `0.0.0.0` | `0.0.0.0` | Non-secret | Bind host for Fastify API process. |
| `API_PORT` | Optional | `8000` | `8000` | Non-secret | Internal container/service port. |
| `TELEGRAM_BOT_TOKEN` | Optional* | None | `123456789:AAEXAMPLE_bot_token_value` | Secret | Required only when enabling Telegram delivery. |
| `TELEGRAM_CHAT_ID_DEFAULT` | Optional* | None | `-1001234567890` | Non-secret | Use either this or `TELEGRAM_CHAT_ID_MAP` when `TELEGRAM_BOT_TOKEN` is set. |
| `TELEGRAM_CHAT_ID_MAP` | Optional* | None | `{"6f9d...":"-1001234567890"}` | Non-secret | JSON map of `userId -> chatId`; alternative to default chat ID. |

\* Telegram vars are conditionally required: if `TELEGRAM_BOT_TOKEN` is set, at least one of `TELEGRAM_CHAT_ID_DEFAULT` or `TELEGRAM_CHAT_ID_MAP` must be configured.

## Worker service

| Variable | Required | Default | Example production value | Secret? | Notes |
|---|---|---|---|---|---|
| `WORKER_CONCURRENCY` | Optional | `5` | `10` | Non-secret | Tune based on CPU and queue throughput. |
| `INGESTION_MODE` | Yes | `live` | `live` | Non-secret | Supported values: `fixture`, `live`, `scrapling`. |
| `INGESTION_POLL_INTERVAL_MS` | Optional | `60000` | `60000` | Non-secret | Must be a positive integer. |

## Scrapling mode (`INGESTION_MODE=scrapling`)

| Variable | Required | Default | Example production value | Secret? | Notes |
|---|---|---|---|---|---|
| `SCRAPLING_PYTHON_BIN` | Optional | `python3` | `/usr/bin/python3` | Non-secret | Python executable used by the connector process. |
| `SCRAPLING_SCRIPT_PATH` | Optional | `apps/worker/src/ingestion/connectors/scripts/scrapling_weworkremotely.py` | `/app/apps/worker/src/ingestion/connectors/scripts/scrapling_weworkremotely.py` | Non-secret | Python script invoked by the worker. |
| `SCRAPLING_TARGET_URL` | Optional | `https://weworkremotely.com/remote-jobs` | `https://weworkremotely.com/remote-jobs` | Non-secret | Scrape target URL. |

## Minimum safe production profile

Start conservatively and only increase blast radius after validation:

1. Set `INGESTION_MODE=live` for initial production bring-up.
2. For smoke tests only, temporarily use `INGESTION_MODE=fixture` to validate pipeline wiring deterministically.
3. Enable Scrapling (`INGESTION_MODE=scrapling`) only after validating queue health, ingestion quality, and operational monitoring in your environment.
