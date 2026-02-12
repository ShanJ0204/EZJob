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

## Health checks

- API: `GET /health`
- Worker: inspect process logs for startup and queue attach messages.
