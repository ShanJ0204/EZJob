# Release checklist

Use this checklist for production releases to keep rollout risk low and improve recoverability.

## Pre-deploy

- [ ] Take a backup database snapshot.
- [ ] Pull new container images for all services.
- [ ] Run Prisma migrations:

```bash
npm run prisma:migrate:deploy --workspace @ezjob/api
```

## Deploy

- [ ] Roll the API service first.
- [ ] After API health is verified, roll the worker service.

## Post-deploy smoke checks

- [ ] Verify API health endpoint responds successfully: `GET /health`.
- [ ] Verify queue visibility endpoint responds successfully: `GET /queues`.
- [ ] Confirm one ingestion cycle completes with logs showing successful source processing.

## Rollback

- [ ] Revert to the previous image tag.
- [ ] Restart affected services.
- [ ] Apply database rollback policy: prefer forward-fix migrations; only perform DB rollback when a migration is destructive and a rollback path is explicitly validated.
