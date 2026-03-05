# EZJob Monorepo

EZJob is organized as a modular monorepo to separate external APIs, async processing, and shared domain contracts.

## Project layout

- `apps/api` — Node.js API service (HTTP entrypoint for clients and integrations).
- `apps/worker` — background queue consumers for ingestion, matching, and apply workflows.
- `libs/common` — shared DTOs, constants, validation schemas, and utility contracts used by API and workers.
- `infra` — local/dev infrastructure definitions (`docker-compose`) and deployment manifests.
- `docs` — architecture notes and operations runbooks.

## Quick start

1. Install Node.js 20+ and npm 10+.
2. Copy environment template:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies from the repo root:
   ```bash
   npm install
   ```
4. Start the API in dev mode:
   ```bash
   npm run dev --workspace @ezjob/api
   ```
5. Start workers in dev mode:
   ```bash
   npm run dev --workspace @ezjob/worker
   ```


## Deterministic demo mode

Use fixture ingestion data so the same postings are always available in demos:

```bash
cp .env.example .env
# Ensure INGESTION_MODE=fixture
npm run dev --workspace @ezjob/worker
```

Seed a demo user + match result and print ready-to-run curl commands:

```bash
DATABASE_URL=postgresql://ezjob:ezjob@127.0.0.1:5432/ezjob \
  API_BASE_URL=http://127.0.0.1:8000 \
  scripts/demo/seed-demo-data.sh
```


## Scrapling ingestion mode

EZJob worker supports a Scrapling-powered ingestion mode for scraping job boards with adaptive selectors.

1. Install Python dependencies:
   ```bash
   pip install scrapling "scrapling[fetchers]"
   ```
2. Set worker mode in `.env`:
   ```bash
   INGESTION_MODE=scrapling
   SCRAPLING_PYTHON_BIN=python3
   SCRAPLING_SCRIPT_PATH=apps/worker/src/ingestion/connectors/scripts/scrapling_weworkremotely.py
   SCRAPLING_TARGET_URL=https://weworkremotely.com/remote-jobs
   ```
3. Start worker:
   ```bash
   npm run dev --workspace @ezjob/worker
   ```

## Architecture summary

- API receives requests and publishes jobs/events.
- Worker processes async tasks from queues and updates downstream state.
- Shared models in `libs/common` enforce consistent payload contracts.
- Infrastructure folder defines local dependencies (Redis, Postgres) used by both runtime services.

## Next steps

- Add real queue provider adapters (BullMQ/SQS/RabbitMQ).
- Expand ingestion + matching orchestration into queue-driven workflows.
- Add CI pipelines for lint, test, build, and release.
