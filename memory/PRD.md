# EZJob - Product Requirements Document

## Original Problem Statement
Build a comprehensive job-matching automation platform with:
1. Google OAuth authentication (Emergent-managed)
2. Candidate-facing frontend dashboard
3. AI-powered matching with GPT-5.2
4. Real apply logic (mark ready + job link)
5. GitHub Actions CI/CD
6. Resume upload & PDF parsing for richer match scoring
7. WeWorkRemotely RSS connector for more job sources
8. Email + Telegram notifications for high-score matches (80+)
9. Match analytics/trends page

## Architecture
- **Frontend**: React 18 + Tailwind CSS (port 3000)
- **Backend**: Python FastAPI + Motor (async MongoDB) (port 8001)
- **Database**: MongoDB (users, sessions, preferences, profiles, job_postings, match_results, applications, ingestion_runs, notification_events, notification_settings)
- **LLM**: OpenAI GPT-5.2 via emergentintegrations with Emergent LLM key
- **Auth**: Emergent-managed Google OAuth with session cookies
- **Notifications**: Resend (email), Telegram Bot API — user-configurable
- **Job Sources**: Remotive API, WeWorkRemotely RSS
- **CI/CD**: GitHub Actions (TypeScript check, Python lint, frontend build)

## What's Been Implemented

### Phase 1: Merge Conflict Resolution
- Resolved 10 files with git merge conflicts in Node.js monorepo

### Phase 2: Full-Stack Platform (MVP)
- Google OAuth, 16 API endpoints, React frontend (6 pages), GPT-5.2 matching, Remotive ingestion, apply workflow, CI/CD
- 100% test pass rate

### Phase 3: Feature Expansion (Current)
- **Resume Upload & PDF Parsing**: POST /api/resume/upload extracts text via pdfplumber, stored in candidate profile, included in LLM matching prompts for richer scoring
- **WeWorkRemotely RSS Connector**: Fetches jobs from RSS feed alongside Remotive (72+ total jobs indexed)
- **Email Notifications**: Resend integration, auto-sends for 80+ score matches, configurable in preferences
- **Telegram Notifications**: User-configurable bot token + chat ID, auto-sends for 80+ score matches
- **Analytics Page**: Score distribution, match trends (30 days), status breakdown, source breakdown, application funnel, top matches, notification stats
- **Notification Settings**: User can configure email/telegram per channel, test notifications
- 100% backend (24/24), 100% integration test pass rate

## Testing Results
- Iteration 1: 100% backend, 100% frontend, 100% integration
- Iteration 2: 100% backend (24/24), 95% frontend (auth-gated), 100% integration

## Prioritized Backlog

### P0 — Done
- [x] Google OAuth authentication
- [x] AI matching with GPT-5.2
- [x] Apply logic + application tracking
- [x] Candidate dashboard
- [x] Resume upload & PDF parsing
- [x] WeWorkRemotely RSS connector
- [x] Email + Telegram notifications
- [x] Analytics/trends page
- [x] CI/CD pipeline

### P1 — Next
- [ ] Resend API key configuration (email currently skipped without key)
- [ ] More job sources (LinkedIn, Indeed)
- [ ] AI-generated cover letters per match

### P2 — Future
- [ ] Browser extension for one-click apply
- [ ] Admin dashboard
- [ ] Resume skills extraction + structured parsing
- [ ] Match comparison view
