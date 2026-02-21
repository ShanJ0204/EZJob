# Runbook

## Local development

1. Start dependencies:
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```
2. Install JS dependencies:
   ```bash
   npm install
   ```
3. Run API:
   ```bash
   npm run dev --workspace @ezjob/api
   ```
4. Run worker:
   ```bash
   npm run dev --workspace @ezjob/worker
   ```

### Worker ingestion behavior

- Worker now runs ingestion immediately on startup and then continuously on `INGESTION_POLL_INTERVAL_MS`.
- If `DATABASE_URL` is set, ingestion writes to `job_postings` and `ingestion_runs` in Postgres.
- If `DATABASE_URL` is missing, worker falls back to local file storage at `apps/worker/.data/ingestion-store.json`.
5. Optional worker storage mode:
   - default: `INGESTION_STORE_DRIVER=postgres`
   - fallback local mode: `INGESTION_STORE_DRIVER=file`

## Health checks

- API: `GET /health`
- Worker: inspect process logs for startup and queue attach messages.

## Ingestion persistence

- Ingestion now persists to Postgres `job_postings` and `ingestion_runs` by default.
- The worker also supports file mode (`apps/worker/.data/ingestion-store.json`) for local debugging.

## Telegram notifications

1. Set the following variables in `.env`:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID_DEFAULT` or `TELEGRAM_CHAT_ID_MAP`
   - `TELEGRAM_CALLBACK_SECRET` (used to sign callback payloads)
   - `TELEGRAM_WEBHOOK_SECRET` (validated against Telegram webhook header)
2. Expose your API publicly (for Telegram webhooks) and register webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H "content-type: application/json" \
     -d '{"url":"https://<your-domain>/notifications/telegram/webhook","secret_token":"'$TELEGRAM_WEBHOOK_SECRET'"}'
   ```
3. Trigger alert sends via:
   - `POST /notifications/match-alerts/send`
4. Telegram inline keyboard actions are consumed by:
   - `POST /notifications/telegram/webhook`
