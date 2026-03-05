# Production readiness exit criteria

All items below must be satisfied before promoting EZJob into production.

## CI / delivery gates

- [ ] `npm ci` succeeds on CI for the monorepo root.
- [ ] `npm run build` succeeds for all npm workspaces (`apps/*`, `libs/*`).
- [ ] API tests under `apps/api/src/**/*.test.ts` pass in CI.
- [ ] Worker ingestion smoke test passes in CI (`apps/worker/src/ingestion/service.integration.test.ts`).

## Runtime reliability gates

- [ ] API uptime monitor is active and alerting on `/health` failures.
- [ ] Worker failure log monitor is active and alerting on log patterns:
  - `ingestion phase failed`
  - `matching phase failed`
- [ ] Alert routes (Slack/PagerDuty/on-call) are configured and validated with a test notification.

## Data and workload safety gates

- [ ] Prisma migrations (`npm run prisma:migrate:deploy --workspace @ezjob/api`) are applied successfully in target environment.
- [ ] At least one ingestion cycle has completed successfully in fixture mode in the target environment.
- [ ] Matching cycle consumes newly ingested postings and persists match results without errors.

## Operational readiness gates

- [ ] `GET /health` and `GET /queues` are reachable from production networking boundaries.
- [ ] Runbook links and rollback steps are verified and up to date.
- [ ] Log retention and searchable logs are configured for API and worker services.
- [ ] On-call owners for API and worker alerts are identified for the release window.
