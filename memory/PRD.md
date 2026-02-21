# EZJob - Product Requirements Document

## Original Problem Statement
User asked "Where is this project at currently" — requesting a comprehensive status audit of the EZJob monorepo codebase.

## Architecture
- **Monorepo**: Node.js/TypeScript with npm workspaces
- **API** (`apps/api`): Fastify + Prisma + PostgreSQL — HTTP endpoints for users, notifications, Telegram webhooks
- **Worker** (`apps/worker`): BullMQ + Redis + PostgreSQL — background ingestion, matching, apply pipelines
- **Common** (`libs/common`): Zod schemas, normalization, dedup utilities
- **Infra** (`infra`): Docker Compose (Postgres 16, Redis 7)

## User Personas
1. **Job Seeker / Candidate** — sets preferences, uploads resumes, receives match alerts, approves/rejects matches
2. **System Admin** — monitors ingestion runs, funnel metrics, notification delivery

## Core Requirements (Static)
- Job ingestion from external sources (Remotive API, WeWorkRemotely RSS)
- Candidate-job matching with scoring
- Notification delivery (Telegram, console fallback) with quiet hours & rate limiting
- Assisted apply workflow
- User profile & preference management
- Read-only visibility endpoints (matches, notifications, applications, funnel)

## What's Been Implemented
### Jan 2026 — Initial Build (15 PRs merged)
- Monorepo scaffold with workspaces
- Prisma schema: 10 models (Users, UserPreferences, CandidateProfiles, ResumeMasters, ResumeVariants, JobPostings, MatchResults, NotificationEvents, IngestionRuns, ApplicationAttempts)
- 5 Prisma migrations
- Job ingestion pipeline with 2 connectors + normalization + dedup (exact & fuzzy)
- DB-backed ingestion persistence (PostgresIngestionRepository)
- Matching engine with scoring module + DB persistence
- Recurring orchestration loop (Redis-locked scheduling: ingestion → matching → notification)
- Notification system: Telegram bot adapter with retry (429/5xx), console fallback, match alert templates, quiet hours, rate limiting
- Telegram webhook handler with inline keyboard callbacks + dedup
- Assisted apply flow: ApplicationAttempt lifecycle, BullMQ queue, worker processing
- User Setup APIs: Preferences CRUD, Candidate Profile CRUD with ownership checks
- Read-only visibility: GET matches, notifications, applications, funnel stats
- Unit tests for bot, routes, webhook

### Jan 2026 — Merge Conflict Resolution
- Resolved 10 files with git merge conflicts between `codex/explore-feasibility-of-job-scraping-bot` and `main`
- Kept `main` branch features: BullMQ orchestration, apply queue publisher, userId in callbacks, retry logic
- All 3 packages (api, worker, common) compile cleanly with TypeScript strict mode

## Prioritized Backlog

### P0 — Critical
- [ ] No authentication (JWT_SECRET defined but no auth middleware)
- [ ] Apply worker is a stub (marks "succeeded" immediately, no actual application submission)

### P1 — High
- [ ] No frontend/UI — entirely backend services
- [ ] No CI/CD pipeline
- [ ] No resume upload/parsing functionality
- [ ] Matching scoring is rule-based only (no AI/LLM)

### P2 — Medium
- [ ] No end-to-end tests
- [ ] No monitoring/observability (metrics, structured logging)
- [ ] No deployment manifests (K8s, Docker images)
- [ ] File ingestion repository (local fallback) removed — only Postgres driver now

### P3 — Nice to have
- [ ] Additional job source connectors (LinkedIn, Indeed, etc.)
- [ ] Resume tailoring / cover letter generation (LLM-powered)
- [ ] Email notification channel
- [ ] Admin dashboard for ingestion monitoring

## Next Tasks
1. Add JWT authentication middleware to API
2. Build candidate-facing frontend dashboard
3. Integrate LLM-based matching/scoring (GPT or similar)
4. Implement actual job application submission in apply worker
5. Add CI pipeline (lint, test, build)
