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
10. LinkedIn, Indeed, HackerNews, GitHub Jobs connectors
11. Resend API key activation for live emails

## Architecture
- **Frontend**: React 18 + Tailwind CSS (port 3000)
- **Backend**: Python FastAPI + Motor (async MongoDB) (port 8001)
- **Database**: MongoDB
- **LLM**: OpenAI GPT-5.2 via emergentintegrations with Emergent LLM key
- **Auth**: Emergent-managed Google OAuth with session cookies
- **Notifications**: Resend (email, key: re_QSbp4AMu_...), Telegram Bot API (user-configurable)
- **Job Sources**: Remotive API, WeWorkRemotely RSS, HackerNews Algolia, Indeed RSS, LinkedIn public search, GitHub Jobs (Arbeitnow)
- **CI/CD**: GitHub Actions

## What's Been Implemented

### Phase 1: Merge Conflict Resolution
- Resolved 10 files with git merge conflicts in Node.js monorepo

### Phase 2: Full-Stack Platform (MVP)
- Google OAuth, 16 API endpoints, React frontend (6 pages), GPT-5.2 matching, Remotive ingestion

### Phase 3: Feature Expansion
- Resume upload & PDF parsing, WeWorkRemotely RSS, Email+Telegram notifications, Analytics page

### Phase 4: Multi-Source Ingestion + Optimizations (Current)
- **6 Job Sources**: Remotive (22), WeWorkRemotely (50), HackerNews (100), LinkedIn (30), Indeed (0*), GitHub Jobs (0*)
  - *Indeed and GitHub Jobs may return 0 due to rate limiting — best-effort scraping
- **Resend API Key Activated**: Live email notifications for 80+ score matches
- **Polished Telegram UI**: Step-by-step BotFather instructions, test notification with feedback
- **Query Optimizations**: Batch job lookups (N+1 → batch), aggregation for source breakdown
  - Matches: 0.5s, Dashboard: 0.3s, Analytics: 0.07s, Applications: 0.13s

### Testing Results
- Iteration 1: 100% (MVP)
- Iteration 2: 100% (Feature expansion)
- Iteration 3: 87.5% backend (3 timeouts fixed), 100% integration
- Post-optimization: All endpoints < 1s response time

## Prioritized Backlog

### P0 — Done
- [x] All 11 items above

### P1 — Next
- [ ] AI-generated cover letters per match
- [ ] Match comparison/side-by-side view
- [ ] Scheduled matching (auto-run daily)

### P2 — Future
- [ ] Browser extension for one-click apply
- [ ] Admin dashboard
- [ ] Mobile-responsive improvements
- [ ] Resume skills extraction + structured parsing
