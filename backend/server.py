import os
import uuid
import json
import asyncio
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from contextlib import asynccontextmanager

import httpx
import feedparser
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# ── MongoDB ──────────────────────────────────────────────
client: AsyncIOMotorClient = None
db = None

# ── Background task handle ───────────────────────────────
ingestion_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, db, ingestion_task
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.job_postings.create_index([("source_name", 1), ("source_job_id", 1)], unique=True)
    await db.job_postings.create_index([("indexed_at", -1)])
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_preferences.create_index("user_id", unique=True)
    await db.candidate_profiles.create_index("user_id", unique=True)
    await db.match_results.create_index([("user_id", 1), ("job_posting_id", 1)], unique=True)
    await db.application_attempts.create_index([("user_id", 1), ("job_posting_id", 1)])
    ingestion_task = asyncio.create_task(ingestion_loop())
    yield
    if ingestion_task:
        ingestion_task.cancel()
    client.close()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic Models ──────────────────────────────────────
class UserPreferencesUpdate(BaseModel):
    desired_titles: Optional[List[str]] = None
    preferred_locations: Optional[List[str]] = None
    remote_only: Optional[bool] = None
    min_salary: Optional[int] = None
    max_salary: Optional[int] = None
    employment_types: Optional[List[str]] = None
    notifications_enabled: Optional[bool] = None

class CandidateProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    years_experience: Optional[float] = None
    summary: Optional[str] = None

class MatchAction(BaseModel):
    action: str  # "approve" or "reject"

# ── Auth Helpers ─────────────────────────────────────────
async def get_current_user(request: Request):
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ── Auth Routes ──────────────────────────────────────────
@app.get("/api/auth/session")
async def exchange_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID") or request.query_params.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    async with httpx.AsyncClient(timeout=15) as hc:
        resp = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")

    data = resp.json()
    email = data["email"]
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture, "updated_at": datetime.now(timezone.utc)}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })

    await db.user_sessions.update_one(
        {"user_id": user_id},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 3600,
    )
    return {"user_id": user_id, "email": email, "name": name, "picture": picture}

@app.get("/api/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "picture": user.get("picture", ""),
    }

@app.post("/api/auth/logout")
async def auth_logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"status": "ok"}

# ── User Preferences ────────────────────────────────────
@app.get("/api/preferences")
async def get_preferences(user=Depends(get_current_user)):
    prefs = await db.user_preferences.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not prefs:
        prefs = {"user_id": user["user_id"], "desired_titles": [], "preferred_locations": [],
                 "remote_only": False, "min_salary": None, "max_salary": None,
                 "employment_types": [], "notifications_enabled": True}
    return prefs

@app.put("/api/preferences")
async def update_preferences(body: UserPreferencesUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    update_data["user_id"] = user["user_id"]
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.user_preferences.update_one(
        {"user_id": user["user_id"]},
        {"$set": update_data},
        upsert=True,
    )
    prefs = await db.user_preferences.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return prefs

# ── Candidate Profile ───────────────────────────────────
@app.get("/api/profile")
async def get_profile(user=Depends(get_current_user)):
    profile = await db.candidate_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        profile = {"user_id": user["user_id"], "full_name": user.get("name", ""),
                   "phone": None, "linkedin_url": None, "github_url": None,
                   "years_experience": None, "summary": None}
    return profile

@app.put("/api/profile")
async def update_profile(body: CandidateProfileUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    update_data["user_id"] = user["user_id"]
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.user_preferences.update_one({"user_id": user["user_id"]}, {"$set": {}}, upsert=True)
    await db.candidate_profiles.update_one(
        {"user_id": user["user_id"]},
        {"$set": update_data},
        upsert=True,
    )
    profile = await db.candidate_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return profile

# ── Job Postings ─────────────────────────────────────────
@app.get("/api/jobs")
async def list_jobs(limit: int = 50, skip: int = 0, user=Depends(get_current_user)):
    jobs = await db.job_postings.find({}, {"_id": 0}).sort("indexed_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.job_postings.count_documents({})
    return {"jobs": jobs, "total": total}

@app.get("/api/jobs/{posting_id}")
async def get_job(posting_id: str, user=Depends(get_current_user)):
    job = await db.job_postings.find_one({"posting_id": posting_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

# ── Match Results ────────────────────────────────────────
@app.get("/api/matches")
async def list_matches(limit: int = 50, status: Optional[str] = None, user=Depends(get_current_user)):
    query = {"user_id": user["user_id"]}
    if status:
        query["status"] = status
    matches = await db.match_results.find(query, {"_id": 0}).sort("score", -1).limit(limit).to_list(limit)
    for m in matches:
        job = await db.job_postings.find_one({"posting_id": m.get("job_posting_id")}, {"_id": 0})
        m["job"] = job
    return {"matches": matches, "count": len(matches)}

@app.get("/api/matches/{match_id}")
async def get_match(match_id: str, user=Depends(get_current_user)):
    match = await db.match_results.find_one({"match_id": match_id, "user_id": user["user_id"]}, {"_id": 0})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    job = await db.job_postings.find_one({"posting_id": match.get("job_posting_id")}, {"_id": 0})
    match["job"] = job
    return match

@app.post("/api/matches/{match_id}/action")
async def match_action(match_id: str, body: MatchAction, user=Depends(get_current_user)):
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    match = await db.match_results.find_one({"match_id": match_id, "user_id": user["user_id"]}, {"_id": 0})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    await db.match_results.update_one(
        {"match_id": match_id},
        {"$set": {"status": body.action + "d", "updated_at": datetime.now(timezone.utc)}},
    )

    if body.action == "approve":
        job = await db.job_postings.find_one({"posting_id": match["job_posting_id"]}, {"_id": 0})
        attempt_id = f"app_{uuid.uuid4().hex[:12]}"
        await db.application_attempts.insert_one({
            "attempt_id": attempt_id,
            "user_id": user["user_id"],
            "job_posting_id": match["job_posting_id"],
            "match_id": match_id,
            "status": "ready",
            "job_url": job.get("source_url", "") if job else "",
            "job_title": job.get("title", "") if job else "",
            "company_name": job.get("company_name", "") if job else "",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })
        return {"status": "approved", "application": {"attempt_id": attempt_id, "job_url": job.get("source_url", "") if job else ""}}

    return {"status": "rejected"}

# ── Applications ─────────────────────────────────────────
@app.get("/api/applications")
async def list_applications(user=Depends(get_current_user)):
    apps = await db.application_attempts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"applications": apps, "count": len(apps)}

@app.post("/api/applications/{attempt_id}/mark-applied")
async def mark_applied(attempt_id: str, user=Depends(get_current_user)):
    result = await db.application_attempts.update_one(
        {"attempt_id": attempt_id, "user_id": user["user_id"]},
        {"$set": {"status": "applied", "applied_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"status": "applied"}

# ── Dashboard / Funnel ───────────────────────────────────
@app.get("/api/dashboard")
async def get_dashboard(user=Depends(get_current_user)):
    uid = user["user_id"]
    total_matches = await db.match_results.count_documents({"user_id": uid})
    pending = await db.match_results.count_documents({"user_id": uid, "status": "pending"})
    approved = await db.match_results.count_documents({"user_id": uid, "status": "approved"})
    rejected = await db.match_results.count_documents({"user_id": uid, "status": "rejected"})
    applied = await db.application_attempts.count_documents({"user_id": uid, "status": "applied"})
    ready = await db.application_attempts.count_documents({"user_id": uid, "status": "ready"})
    total_jobs = await db.job_postings.count_documents({})
    recent_matches = await db.match_results.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    for m in recent_matches:
        job = await db.job_postings.find_one({"posting_id": m.get("job_posting_id")}, {"_id": 0})
        m["job"] = job
    return {
        "funnel": {"total_matches": total_matches, "pending": pending, "approved": approved,
                   "rejected": rejected, "applied": applied, "ready": ready},
        "total_jobs_indexed": total_jobs,
        "recent_matches": recent_matches,
    }

# ── LLM Matching ────────────────────────────────────────
@app.post("/api/matching/run")
async def run_matching(user=Depends(get_current_user)):
    uid = user["user_id"]
    prefs = await db.user_preferences.find_one({"user_id": uid}, {"_id": 0})
    profile = await db.candidate_profiles.find_one({"user_id": uid}, {"_id": 0})

    if not prefs or not prefs.get("desired_titles"):
        raise HTTPException(status_code=400, detail="Set your job preferences first (desired titles)")

    already_matched_ids = set()
    async for m in db.match_results.find({"user_id": uid}, {"job_posting_id": 1, "_id": 0}):
        already_matched_ids.add(m["job_posting_id"])

    query = {}
    title_keywords = prefs.get("desired_titles", [])
    if title_keywords:
        regex_pattern = "|".join([t.replace(" ", ".*") for t in title_keywords])
        query["title"] = {"$regex": regex_pattern, "$options": "i"}
    if prefs.get("remote_only"):
        query["is_remote"] = True

    jobs = await db.job_postings.find(query, {"_id": 0}).sort("indexed_at", -1).limit(20).to_list(20)
    jobs = [j for j in jobs if j.get("posting_id") not in already_matched_ids]

    if not jobs:
        return {"matches_created": 0, "message": "No new jobs to match. Try updating your preferences or wait for new postings."}

    new_matches = 0
    for job in jobs[:10]:
        try:
            score_data = await score_match_with_llm(prefs, profile, job)
            match_id = f"match_{uuid.uuid4().hex[:12]}"
            await db.match_results.update_one(
                {"user_id": uid, "job_posting_id": job["posting_id"]},
                {"$set": {
                    "match_id": match_id,
                    "user_id": uid,
                    "job_posting_id": job["posting_id"],
                    "score": score_data.get("score", 50),
                    "reason_summary": score_data.get("reason_summary", ""),
                    "reasons": score_data.get("reasons", []),
                    "status": "pending",
                    "created_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )
            new_matches += 1
        except Exception as e:
            print(f"LLM scoring error for job {job.get('posting_id')}: {e}")
            match_id = f"match_{uuid.uuid4().hex[:12]}"
            await db.match_results.update_one(
                {"user_id": uid, "job_posting_id": job["posting_id"]},
                {"$set": {
                    "match_id": match_id,
                    "user_id": uid,
                    "job_posting_id": job["posting_id"],
                    "score": 50,
                    "reason_summary": "Score based on keyword matching",
                    "reasons": [{"label": "Title Match", "detail": "Job title aligns with your preferences"}],
                    "status": "pending",
                    "created_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )
            new_matches += 1

    return {"matches_created": new_matches}


async def score_match_with_llm(prefs, profile, job):
    if not EMERGENT_LLM_KEY:
        return fallback_score(prefs, profile, job)

    candidate_info = []
    if prefs:
        candidate_info.append(f"Desired Titles: {', '.join(prefs.get('desired_titles', []))}")
        candidate_info.append(f"Preferred Locations: {', '.join(prefs.get('preferred_locations', []))}")
        candidate_info.append(f"Remote Only: {prefs.get('remote_only', False)}")
        if prefs.get("min_salary"):
            candidate_info.append(f"Min Salary: ${prefs['min_salary']:,}")
    if profile:
        if profile.get("summary"):
            candidate_info.append(f"Summary: {profile['summary']}")
        if profile.get("years_experience"):
            candidate_info.append(f"Experience: {profile['years_experience']} years")

    job_info = [
        f"Title: {job.get('title', '')}",
        f"Company: {job.get('company_name', '')}",
        f"Location: {job.get('location_text', 'Not specified')}",
        f"Remote: {job.get('is_remote', False)}",
        f"Type: {job.get('employment_type', 'Not specified')}",
    ]
    if job.get("salary_min") or job.get("salary_max"):
        job_info.append(f"Salary: ${job.get('salary_min', '?'):,} - ${job.get('salary_max', '?'):,}")
    desc = job.get("description", "")
    if desc and len(desc) > 1500:
        desc = desc[:1500] + "..."
    if desc:
        job_info.append(f"Description: {desc}")

    prompt = f"""Score how well this candidate matches the job posting. Return ONLY valid JSON.

Candidate:
{chr(10).join(candidate_info)}

Job Posting:
{chr(10).join(job_info)}

Return JSON: {{"score": <0-100>, "reason_summary": "<one sentence>", "reasons": [{{"label": "<category>", "detail": "<explanation>"}}]}}"""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"matching_{uuid.uuid4().hex[:8]}",
            system_message="You are a job matching AI. Return ONLY valid JSON with score (0-100), reason_summary, and reasons array.",
        )
        chat.with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))
        text = response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]
        return json.loads(text)
    except Exception as e:
        print(f"LLM error: {e}")
        return fallback_score(prefs, profile, job)


def fallback_score(prefs, profile, job):
    score = 50
    reasons = []
    if prefs and prefs.get("desired_titles"):
        title_lower = job.get("title", "").lower()
        for dt in prefs["desired_titles"]:
            if dt.lower() in title_lower:
                score += 20
                reasons.append({"label": "Title Match", "detail": f"Job title matches '{dt}'"})
                break
    if prefs and prefs.get("remote_only") and job.get("is_remote"):
        score += 10
        reasons.append({"label": "Remote", "detail": "Job is remote as preferred"})
    if prefs and prefs.get("preferred_locations"):
        loc = job.get("location_text", "").lower()
        for pl in prefs["preferred_locations"]:
            if pl.lower() in loc:
                score += 10
                reasons.append({"label": "Location Match", "detail": f"Location matches '{pl}'"})
                break
    score = min(score, 100)
    return {"score": score, "reason_summary": "Scored based on preference matching", "reasons": reasons or [{"label": "General", "detail": "Basic keyword matching applied"}]}


# ── Job Ingestion ────────────────────────────────────────
REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs"

async def fetch_remotive_jobs():
    try:
        async with httpx.AsyncClient(timeout=30) as hc:
            resp = await hc.get(REMOTIVE_API_URL, params={"limit": 50})
            if resp.status_code != 200:
                return []
            data = resp.json()
            jobs = data.get("jobs", [])
            results = []
            for j in jobs:
                posting_id = f"remotive_{j.get('id', '')}"
                results.append({
                    "posting_id": posting_id,
                    "source_name": "remotive",
                    "source_job_id": str(j.get("id", "")),
                    "source_url": j.get("url", ""),
                    "title": j.get("title", ""),
                    "company_name": j.get("company_name", ""),
                    "location_text": j.get("candidate_required_location", "Worldwide"),
                    "is_remote": True,
                    "employment_type": (j.get("job_type") or "").replace("_", "-").lower() or "full-time",
                    "seniority_level": None,
                    "salary_min": None,
                    "salary_max": None,
                    "salary_currency": None,
                    "posted_at": j.get("publication_date"),
                    "description": j.get("description", "")[:5000],
                    "category": j.get("category", ""),
                    "tags": j.get("tags", []),
                    "indexed_at": datetime.now(timezone.utc),
                })
            return results
    except Exception as e:
        print(f"Remotive fetch error: {e}")
        return []


async def ingest_jobs():
    jobs = await fetch_remotive_jobs()
    inserted = 0
    for job in jobs:
        try:
            await db.job_postings.update_one(
                {"source_name": job["source_name"], "source_job_id": job["source_job_id"]},
                {"$set": job},
                upsert=True,
            )
            inserted += 1
        except Exception:
            pass

    run_id = f"run_{uuid.uuid4().hex[:12]}"
    await db.ingestion_runs.insert_one({
        "run_id": run_id,
        "source": "remotive",
        "started_at": datetime.now(timezone.utc),
        "completed_at": datetime.now(timezone.utc),
        "fetched_count": len(jobs),
        "inserted_count": inserted,
    })
    return {"fetched": len(jobs), "inserted": inserted}


async def ingestion_loop():
    await asyncio.sleep(5)
    while True:
        try:
            result = await ingest_jobs()
            print(f"Ingestion cycle: {result}")
        except Exception as e:
            print(f"Ingestion error: {e}")
        await asyncio.sleep(300)


@app.post("/api/ingestion/run")
async def trigger_ingestion(user=Depends(get_current_user)):
    result = await ingest_jobs()
    return result

@app.get("/api/ingestion/stats")
async def ingestion_stats(user=Depends(get_current_user)):
    runs = await db.ingestion_runs.find({}, {"_id": 0}).sort("completed_at", -1).limit(10).to_list(10)
    total_jobs = await db.job_postings.count_documents({})
    return {"recent_runs": runs, "total_jobs_indexed": total_jobs}

# ── Health ───────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
