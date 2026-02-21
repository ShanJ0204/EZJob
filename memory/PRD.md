# EZJob - Product Requirements Document

## Original Problem Statement
Build a comprehensive job-matching automation platform with:
1. JWT/Google OAuth authentication (Emergent-managed Google social login)
2. Candidate-facing frontend dashboard
3. AI-powered matching with GPT-5.2 via Emergent LLM key
4. Real apply logic (mark as ready + notify with job link)
5. GitHub Actions CI/CD pipeline

## Architecture
- **Frontend**: React 18 + Tailwind CSS + Framer Motion (port 3000)
- **Backend**: Python FastAPI + Motor (async MongoDB) (port 8001)
- **Database**: MongoDB (users, sessions, preferences, profiles, job_postings, match_results, applications, ingestion_runs)
- **LLM**: OpenAI GPT-5.2 via emergentintegrations library with Emergent LLM key
- **Auth**: Emergent-managed Google OAuth with session cookies
- **Legacy**: Node.js/TypeScript monorepo (apps/api, apps/worker, libs/common) — original codebase with Prisma/PostgreSQL schema, merge conflicts resolved

## User Personas
1. **Job Seeker** — logs in, sets preferences, views AI-scored matches, approves/rejects, tracks applications
2. **System Admin** — monitors ingestion stats, job indexing, matching pipeline

## Core Requirements
- Google OAuth login via Emergent Auth
- Dashboard with funnel stats (total matches, pending, approved, applied)
- AI job matching: GPT-5.2 scores candidate-job pairs (0-100) with reasons
- Job ingestion from Remotive API (automated every 5 min + manual trigger)
- Match approve/reject with application tracking
- User preferences: desired titles, locations, salary, remote-only, notifications
- Candidate profile management

## What's Been Implemented (Jan 2026)

### Phase 1: Codebase Audit & Conflict Resolution
- Resolved 10 files with unresolved merge conflicts in Node.js monorepo
- All 3 TypeScript packages compile cleanly

### Phase 2: Full-Stack Platform Build
- **Auth**: Emergent Google OAuth (session exchange, cookie auth, /me, /logout)
- **Backend API**: 16 endpoints (health, auth, preferences CRUD, profile CRUD, dashboard, jobs, matches, match actions, applications, ingestion, matching)
- **LLM Matching**: GPT-5.2 scoring with structured JSON output (score, summary, reasons). Fallback keyword scorer.
- **Job Ingestion**: Remotive API connector, auto-ingest every 5 min, manual trigger
- **Apply Logic**: Approve → creates application attempt (status: ready) + returns job URL
- **Frontend**: 6 pages (Login, Dashboard, Matches, Preferences, Profile, Applications)
- **CI/CD**: GitHub Actions workflow (TypeScript check, Python lint, frontend build)
- **Design**: Dark theme (#0A0A0A background), Outfit + Manrope fonts, blue accent (#3B82F6), score ring visualizations

### Testing Results
- Backend: 100% (16/16 tests passed)
- Frontend: 100% (all pages load, navigate, integrate with backend)
- Integration: 100% (auth flow, data flow, LLM scoring all working)

## Prioritized Backlog

### P0 — Done
- [x] Google OAuth authentication
- [x] AI-powered matching with GPT-5.2
- [x] Real apply logic (mark ready + job link)
- [x] Candidate dashboard

### P1 — Next Up
- [ ] Resume upload and parsing (PDF → text extraction)
- [ ] Additional job source connectors (LinkedIn, Indeed, WeWorkRemotely RSS)
- [ ] Email notifications for new matches
- [ ] Match history/analytics over time

### P2 — Future
- [ ] AI-generated cover letters per match
- [ ] Browser extension for one-click apply
- [ ] Admin dashboard for system monitoring
- [ ] Multi-user team features
- [ ] Mobile-responsive improvements

## Next Tasks
1. Resume upload + parsing
2. WeWorkRemotely RSS connector in Python backend
3. Email notification channel
4. Match analytics/trends page
