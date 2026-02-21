import os
import uuid
import json
import asyncio
import hashlib
import re
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from contextlib import asynccontextmanager
from io import BytesIO

import httpx
import resend
import feedparser
import pdfplumber
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
HIGH_SCORE_THRESHOLD = 80

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

client: AsyncIOMotorClient = None
db = None
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
    await db.match_results.create_index([("user_id", 1), ("created_at", -1)])
    await db.application_attempts.create_index([("user_id", 1), ("job_posting_id", 1)])
    await db.notification_events.create_index([("user_id", 1), ("created_at", -1)])
    await db.notification_settings.create_index("user_id", unique=True)
    ingestion_task = asyncio.create_task(ingestion_loop())
    yield
    if ingestion_task:
        ingestion_task.cancel()
    client.close()

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

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
    action: str

class NotificationSettingsUpdate(BaseModel):
    email_enabled: Optional[bool] = None
    email_address: Optional[str] = None
    telegram_enabled: Optional[bool] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None

# ── Auth ─────────────────────────────────────────────────
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

@app.get("/api/auth/session")
async def exchange_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID") or request.query_params.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    async with httpx.AsyncClient(timeout=15) as hc:
        resp = await hc.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": session_id})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = resp.json()
    email, name, picture = data["email"], data.get("name", ""), data.get("picture", "")
    session_token = data["session_token"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"email": email}, {"$set": {"name": name, "picture": picture, "updated_at": datetime.now(timezone.utc)}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"user_id": user_id, "email": email, "name": name, "picture": picture, "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)})
    await db.user_sessions.update_one({"user_id": user_id}, {"$set": {"session_token": session_token, "user_id": user_id, "expires_at": datetime.now(timezone.utc) + timedelta(days=7), "created_at": datetime.now(timezone.utc)}}, upsert=True)
    response.set_cookie(key="session_token", value=session_token, httponly=True, secure=True, samesite="none", path="/", max_age=7*24*3600)
    return {"user_id": user_id, "email": email, "name": name, "picture": picture}

@app.get("/api/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return {"user_id": user["user_id"], "email": user["email"], "name": user.get("name", ""), "picture": user.get("picture", "")}

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
        prefs = {"user_id": user["user_id"], "desired_titles": [], "preferred_locations": [], "remote_only": False, "min_salary": None, "max_salary": None, "employment_types": [], "notifications_enabled": True}
    return prefs

@app.put("/api/preferences")
async def update_preferences(body: UserPreferencesUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    update_data["user_id"] = user["user_id"]
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.user_preferences.update_one({"user_id": user["user_id"]}, {"$set": update_data}, upsert=True)
    return await db.user_preferences.find_one({"user_id": user["user_id"]}, {"_id": 0})

# ── Candidate Profile ───────────────────────────────────
@app.get("/api/profile")
async def get_profile(user=Depends(get_current_user)):
    profile = await db.candidate_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        profile = {"user_id": user["user_id"], "full_name": user.get("name", ""), "phone": None, "linkedin_url": None, "github_url": None, "years_experience": None, "summary": None, "resume_text": None, "resume_filename": None}
    return profile

@app.put("/api/profile")
async def update_profile(body: CandidateProfileUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    update_data["user_id"] = user["user_id"]
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.candidate_profiles.update_one({"user_id": user["user_id"]}, {"$set": update_data}, upsert=True)
    return await db.candidate_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})

# ── Resume Upload & PDF Parsing ─────────────────────────
@app.post("/api/resume/upload")
async def upload_resume(file: UploadFile = File(...), user=Depends(get_current_user)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    extracted_text = ""
    try:
        pdf_bytes = BytesIO(content)
        with pdfplumber.open(pdf_bytes) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    extracted_text += page_text + "\n"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")

    extracted_text = extracted_text.strip()
    if not extracted_text:
        raise HTTPException(status_code=400, detail="No text could be extracted from the PDF")

    await db.candidate_profiles.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "user_id": user["user_id"],
            "resume_text": extracted_text[:10000],
            "resume_filename": file.filename,
            "resume_uploaded_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    word_count = len(extracted_text.split())
    return {"status": "ok", "filename": file.filename, "word_count": word_count, "text_preview": extracted_text[:500]}

@app.delete("/api/resume")
async def delete_resume(user=Depends(get_current_user)):
    await db.candidate_profiles.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"resume_text": None, "resume_filename": None, "resume_uploaded_at": None, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"status": "ok"}

# ── Notification Settings ────────────────────────────────
@app.get("/api/notifications/settings")
async def get_notification_settings(user=Depends(get_current_user)):
    settings = await db.notification_settings.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not settings:
        settings = {"user_id": user["user_id"], "email_enabled": False, "email_address": user.get("email", ""), "telegram_enabled": False, "telegram_bot_token": "", "telegram_chat_id": ""}
    return settings

@app.put("/api/notifications/settings")
async def update_notification_settings(body: NotificationSettingsUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    update_data["user_id"] = user["user_id"]
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.notification_settings.update_one({"user_id": user["user_id"]}, {"$set": update_data}, upsert=True)
    return await db.notification_settings.find_one({"user_id": user["user_id"]}, {"_id": 0})

@app.get("/api/notifications/history")
async def get_notification_history(user=Depends(get_current_user)):
    events = await db.notification_events.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"notifications": events, "count": len(events)}

@app.post("/api/notifications/test")
async def test_notification(user=Depends(get_current_user)):
    settings = await db.notification_settings.find_one({"user_id": user["user_id"]}, {"_id": 0})
    results = {}
    if settings and settings.get("email_enabled") and settings.get("email_address"):
        results["email"] = await send_email_notification(user["user_id"], settings["email_address"], "EZJob Test Notification", "<h2>Test notification from EZJob</h2><p>Your email notifications are working!</p>")
    if settings and settings.get("telegram_enabled") and settings.get("telegram_bot_token") and settings.get("telegram_chat_id"):
        results["telegram"] = await send_telegram_notification(settings["telegram_bot_token"], settings["telegram_chat_id"], "EZJob Test: Your Telegram notifications are working!", user["user_id"])
    if not results:
        return {"status": "no_channels", "message": "No notification channels configured. Enable email or Telegram in settings."}
    return {"status": "sent", "results": results}

# ── Notification Senders ─────────────────────────────────
async def send_email_notification(user_id, to_email, subject, html_content):
    if not RESEND_API_KEY:
        await log_notification(user_id, "email", "skipped", {"reason": "RESEND_API_KEY not configured", "to": to_email, "subject": subject})
        return {"status": "skipped", "reason": "Email service not configured (RESEND_API_KEY missing)"}
    try:
        params = {"from": SENDER_EMAIL, "to": [to_email], "subject": subject, "html": html_content}
        email_resp = await asyncio.to_thread(resend.Emails.send, params)
        email_id = email_resp.get("id") if isinstance(email_resp, dict) else getattr(email_resp, "id", None)
        await log_notification(user_id, "email", "sent", {"to": to_email, "subject": subject, "email_id": email_id})
        return {"status": "sent", "email_id": email_id}
    except Exception as e:
        await log_notification(user_id, "email", "failed", {"to": to_email, "error": str(e)})
        return {"status": "failed", "error": str(e)}

async def send_telegram_notification(bot_token, chat_id, text, user_id):
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as hc:
            resp = await hc.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
        result = resp.json()
        status = "sent" if result.get("ok") else "failed"
        await log_notification(user_id, "telegram", status, {"chat_id": chat_id, "response": result})
        return {"status": status, "message_id": result.get("result", {}).get("message_id") if result.get("ok") else None}
    except Exception as e:
        await log_notification(user_id, "telegram", "failed", {"error": str(e)})
        return {"status": "failed", "error": str(e)}

async def log_notification(user_id, channel, status, payload):
    await db.notification_events.insert_one({
        "event_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "channel": channel, "status": status,
        "payload": payload, "created_at": datetime.now(timezone.utc),
    })

async def notify_high_score_matches(user_id, matches_with_jobs):
    high_scores = [m for m in matches_with_jobs if m.get("score", 0) >= HIGH_SCORE_THRESHOLD]
    if not high_scores:
        return
    settings = await db.notification_settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        return

    for match in high_scores:
        job = match.get("job", {})
        title = job.get("title", "Unknown Position")
        company = job.get("company_name", "Unknown Company")
        score = match.get("score", 0)
        url = job.get("source_url", "")

        if settings.get("email_enabled") and settings.get("email_address"):
            html = f"""
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fafafa;padding:32px;border-radius:12px;">
                <h2 style="color:#3B82F6;margin:0 0 16px;">New High-Score Match!</h2>
                <div style="background:#121212;padding:20px;border-radius:8px;border:1px solid #27272A;">
                    <h3 style="margin:0 0 8px;color:#fafafa;">{title}</h3>
                    <p style="margin:0 0 4px;color:#A1A1AA;">{company}</p>
                    <p style="margin:12px 0 0;"><span style="background:#10B981;color:#fff;padding:4px 12px;border-radius:20px;font-weight:bold;">Score: {score}/100</span></p>
                    {f'<p style="margin:16px 0 0;"><a href="{url}" style="color:#3B82F6;text-decoration:none;">View Job Posting &rarr;</a></p>' if url else ''}
                </div>
                <p style="color:#71717A;font-size:12px;margin:16px 0 0;">You're receiving this because your match score threshold is {HIGH_SCORE_THRESHOLD}+</p>
            </div>"""
            await send_email_notification(user_id, settings["email_address"], f"EZJob: {score}/100 Match - {title} at {company}", html)

        if settings.get("telegram_enabled") and settings.get("telegram_bot_token") and settings.get("telegram_chat_id"):
            link_html = f'<a href="{url}">View Job</a>' if url else ''
            msg = f"<b>New High-Score Match!</b>\n\n<b>{title}</b>\n{company}\n\nScore: <b>{score}/100</b>\n{link_html}"
            await send_telegram_notification(settings["telegram_bot_token"], settings["telegram_chat_id"], msg, user_id)

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
    job_ids = list(set(m.get("job_posting_id") for m in matches if m.get("job_posting_id")))
    jobs_map = {}
    if job_ids:
        jobs_cursor = db.job_postings.find({"posting_id": {"$in": job_ids}}, {"_id": 0})
        async for job in jobs_cursor:
            jobs_map[job["posting_id"]] = job
    for m in matches:
        m["job"] = jobs_map.get(m.get("job_posting_id"))
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
    await db.match_results.update_one({"match_id": match_id}, {"$set": {"status": body.action + "d", "updated_at": datetime.now(timezone.utc)}})
    if body.action == "approve":
        job = await db.job_postings.find_one({"posting_id": match["job_posting_id"]}, {"_id": 0})
        profile = await db.candidate_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
        attempt_id = f"app_{uuid.uuid4().hex[:12]}"
        await db.application_attempts.insert_one({
            "attempt_id": attempt_id, "user_id": user["user_id"], "job_posting_id": match["job_posting_id"],
            "match_id": match_id, "status": "ready", "job_url": job.get("source_url", "") if job else "",
            "job_title": job.get("title", "") if job else "", "company_name": job.get("company_name", "") if job else "",
            "cover_letter": None, "cover_letter_status": "generating",
            "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
        })
        # Generate cover letter in background
        asyncio.create_task(generate_cover_letter_bg(attempt_id, user["user_id"], profile, job, match))
        return {"status": "approved", "application": {"attempt_id": attempt_id, "job_url": job.get("source_url", "") if job else ""}}
    return {"status": "rejected"}

# ── Cover Letter Generation ──────────────────────────────
async def generate_cover_letter_bg(attempt_id, user_id, profile, job, match):
    try:
        cover_letter = await generate_cover_letter(profile, job, match)
        await db.application_attempts.update_one(
            {"attempt_id": attempt_id},
            {"$set": {"cover_letter": cover_letter, "cover_letter_status": "ready", "updated_at": datetime.now(timezone.utc)}},
        )
    except Exception as e:
        print(f"Cover letter generation error: {e}")
        await db.application_attempts.update_one(
            {"attempt_id": attempt_id},
            {"$set": {"cover_letter_status": "failed", "updated_at": datetime.now(timezone.utc)}},
        )

async def generate_cover_letter(profile, job, match):
    if not EMERGENT_LLM_KEY:
        return fallback_cover_letter(profile, job)

    candidate_parts = []
    if profile:
        if profile.get("full_name"):
            candidate_parts.append(f"Name: {profile['full_name']}")
        if profile.get("years_experience"):
            candidate_parts.append(f"Experience: {profile['years_experience']} years")
        if profile.get("summary"):
            candidate_parts.append(f"Summary: {profile['summary']}")
        if profile.get("resume_text"):
            candidate_parts.append(f"Resume:\n{profile['resume_text'][:3000]}")

    job_parts = []
    if job:
        job_parts.append(f"Title: {job.get('title', '')}")
        job_parts.append(f"Company: {job.get('company_name', '')}")
        if job.get("location_text"):
            job_parts.append(f"Location: {job['location_text']}")
        desc = (job.get("description", "") or "")[:2000]
        if desc:
            job_parts.append(f"Description: {desc}")

    match_context = ""
    if match:
        match_context = f"\nMatch Score: {match.get('score', 'N/A')}/100\nMatch Reasons: {match.get('reason_summary', '')}"

    prompt = f"""Write a professional, tailored cover letter for this job application.

Candidate Info:
{chr(10).join(candidate_parts) if candidate_parts else 'No profile info available'}
{match_context}

Job Posting:
{chr(10).join(job_parts)}

Requirements:
- Professional but warm tone
- 3-4 concise paragraphs
- Highlight relevant skills and experience that match the job
- Reference the company by name
- Show enthusiasm for the role
- Keep under 400 words
- Do NOT include placeholder text like [Your Name] — use the candidate's actual name if available
- Do NOT include addresses or dates — just the letter body"""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"cover_{uuid.uuid4().hex[:8]}",
            system_message="You are a professional career coach. Write tailored, compelling cover letters that highlight the candidate's relevant strengths.",
        )
        chat.with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))
        return response.strip()
    except Exception as e:
        print(f"Cover letter LLM error: {e}")
        return fallback_cover_letter(profile, job)

def fallback_cover_letter(profile, job):
    name = profile.get("full_name", "the candidate") if profile else "the candidate"
    title = job.get("title", "this position") if job else "this position"
    company = job.get("company_name", "your company") if job else "your company"
    summary = profile.get("summary", "") if profile else ""
    exp = profile.get("years_experience", "") if profile else ""

    letter = f"Dear Hiring Manager,\n\n"
    letter += f"I am writing to express my strong interest in the {title} position at {company}. "
    if exp:
        letter += f"With {exp} years of professional experience, I am confident in my ability to contribute meaningfully to your team.\n\n"
    else:
        letter += f"I am confident that my skills and experience make me a strong candidate for this role.\n\n"
    if summary:
        letter += f"{summary}\n\n"
    letter += f"I am excited about the opportunity to bring my expertise to {company} and contribute to your continued success. "
    letter += f"I look forward to discussing how my background aligns with your needs.\n\n"
    letter += f"Best regards,\n{name}"
    return letter

@app.post("/api/cover-letter/generate")
async def generate_cover_letter_endpoint(match_id: str = None, attempt_id: str = None, user=Depends(get_current_user)):
    profile = await db.candidate_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    job = None
    match = None

    if match_id:
        match = await db.match_results.find_one({"match_id": match_id, "user_id": user["user_id"]}, {"_id": 0})
        if match:
            job = await db.job_postings.find_one({"posting_id": match.get("job_posting_id")}, {"_id": 0})
    elif attempt_id:
        attempt = await db.application_attempts.find_one({"attempt_id": attempt_id, "user_id": user["user_id"]}, {"_id": 0})
        if attempt:
            job = await db.job_postings.find_one({"posting_id": attempt.get("job_posting_id")}, {"_id": 0})
            match = await db.match_results.find_one({"match_id": attempt.get("match_id")}, {"_id": 0})

    if not job:
        raise HTTPException(status_code=404, detail="Job not found for this match/application")

    cover_letter = await generate_cover_letter(profile, job, match)

    if attempt_id:
        await db.application_attempts.update_one(
            {"attempt_id": attempt_id},
            {"$set": {"cover_letter": cover_letter, "cover_letter_status": "ready", "updated_at": datetime.now(timezone.utc)}},
        )

    return {"cover_letter": cover_letter}

@app.get("/api/applications/{attempt_id}/cover-letter")
async def get_cover_letter(attempt_id: str, user=Depends(get_current_user)):
    attempt = await db.application_attempts.find_one({"attempt_id": attempt_id, "user_id": user["user_id"]}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Application not found")
    return {
        "cover_letter": attempt.get("cover_letter"),
        "status": attempt.get("cover_letter_status", "none"),
    }

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

# ── Dashboard ────────────────────────────────────────────
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
    rm_job_ids = list(set(m.get("job_posting_id") for m in recent_matches if m.get("job_posting_id")))
    rm_jobs_map = {}
    if rm_job_ids:
        async for job in db.job_postings.find({"posting_id": {"$in": rm_job_ids}}, {"_id": 0}):
            rm_jobs_map[job["posting_id"]] = job
    for m in recent_matches:
        m["job"] = rm_jobs_map.get(m.get("job_posting_id"))
    return {
        "funnel": {"total_matches": total_matches, "pending": pending, "approved": approved, "rejected": rejected, "applied": applied, "ready": ready},
        "total_jobs_indexed": total_jobs, "recent_matches": recent_matches,
    }

# ── Analytics ────────────────────────────────────────────
@app.get("/api/analytics")
async def get_analytics(user=Depends(get_current_user)):
    uid = user["user_id"]

    # Score distribution
    all_matches = await db.match_results.find({"user_id": uid}, {"_id": 0, "score": 1, "status": 1, "created_at": 1, "job_posting_id": 1}).to_list(500)
    score_buckets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for m in all_matches:
        s = m.get("score", 0)
        if s <= 20: score_buckets["0-20"] += 1
        elif s <= 40: score_buckets["21-40"] += 1
        elif s <= 60: score_buckets["41-60"] += 1
        elif s <= 80: score_buckets["61-80"] += 1
        else: score_buckets["81-100"] += 1

    # Match trend by date (last 30 days)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    recent = []
    for m in all_matches:
        if m.get("created_at"):
            dt = m["created_at"]
            if isinstance(dt, str):
                dt = datetime.fromisoformat(dt)
            # Ensure timezone info
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt >= thirty_days_ago:
                recent.append(m)
    
    daily_counts = {}
    for m in recent:
        dt = m["created_at"]
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        day = dt.strftime("%Y-%m-%d")
        daily_counts[day] = daily_counts.get(day, 0) + 1
    match_trend = [{"date": k, "count": v} for k, v in sorted(daily_counts.items())]

    # Status breakdown
    status_counts = {}
    for m in all_matches:
        st = m.get("status", "pending")
        status_counts[st] = status_counts.get(st, 0) + 1

    # Source breakdown (batch query)
    source_counts = {}
    async for doc in db.job_postings.aggregate([
        {"$match": {"posting_id": {"$in": [m.get("job_posting_id") for m in all_matches]}}},
        {"$group": {"_id": "$source_name", "count": {"$sum": 1}}}
    ]):
        source_counts[doc["_id"]] = doc["count"]

    # Average score
    scores = [m.get("score", 0) for m in all_matches]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0

    # Top scoring matches (batch job fetch)
    top_matches = sorted(all_matches, key=lambda x: x.get("score", 0), reverse=True)[:5]
    top_job_ids = list(set(m.get("job_posting_id") for m in top_matches if m.get("job_posting_id")))
    top_jobs_map = {}
    if top_job_ids:
        async for job in db.job_postings.find({"posting_id": {"$in": top_job_ids}}, {"_id": 0}):
            top_jobs_map[job["posting_id"]] = job
    for m in top_matches:
        m["job"] = top_jobs_map.get(m.get("job_posting_id"))

    # Application funnel
    apps = await db.application_attempts.find({"user_id": uid}, {"_id": 0}).to_list(500)
    app_status = {}
    for a in apps:
        st = a.get("status", "unknown")
        app_status[st] = app_status.get(st, 0) + 1

    # Notification stats
    notif_count = await db.notification_events.count_documents({"user_id": uid})
    notif_sent = await db.notification_events.count_documents({"user_id": uid, "status": "sent"})

    return {
        "score_distribution": score_buckets,
        "match_trend": match_trend,
        "status_breakdown": status_counts,
        "source_breakdown": source_counts,
        "average_score": avg_score,
        "total_matches": len(all_matches),
        "top_matches": top_matches,
        "application_funnel": app_status,
        "notifications": {"total": notif_count, "sent": notif_sent},
    }

# ── LLM Matching (with resume support) ──────────────────
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
        regex_pattern = "|".join([re.escape(t) for t in title_keywords])
        query["title"] = {"$regex": regex_pattern, "$options": "i"}
    if prefs.get("remote_only"):
        query["is_remote"] = True

    jobs = await db.job_postings.find(query, {"_id": 0}).sort("indexed_at", -1).limit(30).to_list(30)
    jobs = [j for j in jobs if j.get("posting_id") not in already_matched_ids]
    if not jobs:
        return {"matches_created": 0, "message": "No new jobs to match."}

    new_matches = []
    for job in jobs[:5]:
        try:
            score_data = await score_match_with_llm(prefs, profile, job)
        except Exception as e:
            print(f"LLM scoring error: {e}")
            score_data = fallback_score(prefs, profile, job)
        match_id = f"match_{uuid.uuid4().hex[:12]}"
        await db.match_results.update_one(
            {"user_id": uid, "job_posting_id": job["posting_id"]},
            {"$set": {"match_id": match_id, "user_id": uid, "job_posting_id": job["posting_id"],
                      "score": score_data.get("score", 50), "reason_summary": score_data.get("reason_summary", ""),
                      "reasons": score_data.get("reasons", []), "status": "pending", "created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        new_matches.append({**score_data, "match_id": match_id, "job_posting_id": job["posting_id"], "job": job})

    # Auto-notify high-score matches
    asyncio.create_task(notify_high_score_matches(uid, new_matches))

    return {"matches_created": len(new_matches)}


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
        if profile.get("resume_text"):
            resume_excerpt = profile["resume_text"][:2000]
            candidate_info.append(f"Resume:\n{resume_excerpt}")

    job_info = [f"Title: {job.get('title', '')}", f"Company: {job.get('company_name', '')}",
                f"Location: {job.get('location_text', 'Not specified')}", f"Remote: {job.get('is_remote', False)}",
                f"Type: {job.get('employment_type', 'Not specified')}"]
    if job.get("salary_min") or job.get("salary_max"):
        job_info.append(f"Salary: ${job.get('salary_min', '?'):,} - ${job.get('salary_max', '?'):,}")
    desc = (job.get("description", "") or "")[:1500]
    if desc:
        job_info.append(f"Description: {desc}")

    prompt = f"""Score how well this candidate matches the job posting. Return ONLY valid JSON.

Candidate:
{chr(10).join(candidate_info)}

Job Posting:
{chr(10).join(job_info)}

Return JSON: {{"score": <0-100>, "reason_summary": "<one sentence>", "reasons": [{{"label": "<category>", "detail": "<explanation>"}}]}}"""

    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"matching_{uuid.uuid4().hex[:8]}",
                        system_message="You are a job matching AI. Return ONLY valid JSON with score (0-100), reason_summary, and reasons array.")
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
    if profile and profile.get("resume_text"):
        score += 5
        reasons.append({"label": "Resume", "detail": "Resume data available for matching"})
    return {"score": min(score, 100), "reason_summary": "Scored based on preference matching", "reasons": reasons or [{"label": "General", "detail": "Basic keyword matching applied"}]}


# ── Job Ingestion (6 Sources) ────────────────────────────
REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs"
WWR_RSS_URL = "https://weworkremotely.com/remote-jobs.rss"
HN_ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"
INDEED_RSS_URL = "https://www.indeed.com/rss"
LINKEDIN_JOBS_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
GITHUB_JOBS_URL = "https://github.com/trending"

SCRAPER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

async def fetch_remotive_jobs():
    try:
        async with httpx.AsyncClient(timeout=30) as hc:
            resp = await hc.get(REMOTIVE_API_URL, params={"limit": 50})
            if resp.status_code != 200:
                return []
            data = resp.json()
            results = []
            for j in data.get("jobs", []):
                results.append({
                    "posting_id": f"remotive_{j.get('id', '')}", "source_name": "remotive",
                    "source_job_id": str(j.get("id", "")), "source_url": j.get("url", ""),
                    "title": j.get("title", ""), "company_name": j.get("company_name", ""),
                    "location_text": j.get("candidate_required_location", "Worldwide"), "is_remote": True,
                    "employment_type": (j.get("job_type") or "").replace("_", "-").lower() or "full-time",
                    "description": (j.get("description", "") or "")[:5000],
                    "category": j.get("category", ""), "tags": j.get("tags", []),
                    "indexed_at": datetime.now(timezone.utc),
                })
            return results
    except Exception as e:
        print(f"Remotive fetch error: {e}")
        return []

async def fetch_weworkremotely_jobs():
    try:
        async with httpx.AsyncClient(timeout=30) as hc:
            resp = await hc.get(WWR_RSS_URL)
            if resp.status_code != 200:
                return []
        feed = feedparser.parse(resp.text)
        results = []
        for entry in feed.entries[:50]:
            link = entry.get("link", "")
            job_id = hashlib.md5(link.encode()).hexdigest()[:16]
            title_raw = entry.get("title", "")
            parts = title_raw.split(":", 1)
            company = parts[0].strip() if len(parts) > 1 else ""
            title = parts[1].strip() if len(parts) > 1 else title_raw
            results.append({
                "posting_id": f"wwr_{job_id}", "source_name": "weworkremotely",
                "source_job_id": job_id, "source_url": link, "title": title,
                "company_name": company, "location_text": "Remote", "is_remote": True,
                "employment_type": "full-time",
                "description": (entry.get("summary", "") or "")[:5000],
                "category": "", "tags": [],
                "indexed_at": datetime.now(timezone.utc),
            })
        return results
    except Exception as e:
        print(f"WeWorkRemotely fetch error: {e}")
        return []

async def fetch_hackernews_jobs():
    try:
        async with httpx.AsyncClient(timeout=30) as hc:
            resp = await hc.get(HN_ALGOLIA_URL, params={
                "query": "Ask HN: Who is hiring?",
                "tags": "ask_hn",
                "numericFilters": f"created_at_i>{int((datetime.now(timezone.utc) - timedelta(days=60)).timestamp())}",
                "hitsPerPage": 3,
            })
            if resp.status_code != 200:
                return []
            data = resp.json()
            hits = data.get("hits", [])
            if not hits:
                return []
            story_id = hits[0].get("objectID")
            if not story_id:
                return []
            comments_resp = await hc.get(f"https://hn.algolia.com/api/v1/items/{story_id}")
            if comments_resp.status_code != 200:
                return []
            story = comments_resp.json()
        results = []
        children = story.get("children", [])[:100]
        for comment in children:
            text = comment.get("text", "")
            if not text or len(text) < 50:
                continue
            comment_id = str(comment.get("id", ""))
            lines = text.replace("<p>", "\n").split("\n")
            first_line = re.sub(r'<[^>]+>', '', lines[0]).strip() if lines else ""
            parts = first_line.split("|")
            company = parts[0].strip() if parts else "Unknown"
            title_part = parts[1].strip() if len(parts) > 1 else "Software Engineer"
            location_part = parts[2].strip() if len(parts) > 2 else "Remote"
            clean_desc = re.sub(r'<[^>]+>', ' ', text).strip()[:3000]
            is_remote = "remote" in clean_desc.lower() or "remote" in location_part.lower()
            results.append({
                "posting_id": f"hn_{comment_id}", "source_name": "hackernews",
                "source_job_id": comment_id,
                "source_url": f"https://news.ycombinator.com/item?id={comment_id}",
                "title": title_part[:200], "company_name": company[:200],
                "location_text": location_part[:200], "is_remote": is_remote,
                "employment_type": "full-time",
                "description": clean_desc, "category": "tech", "tags": [],
                "indexed_at": datetime.now(timezone.utc),
            })
        return results
    except Exception as e:
        print(f"HackerNews fetch error: {e}")
        return []

async def fetch_indeed_jobs():
    try:
        queries = ["remote developer", "remote software engineer", "remote data scientist"]
        all_results = []
        async with httpx.AsyncClient(timeout=30, headers=SCRAPER_HEADERS) as hc:
            for q in queries:
                try:
                    resp = await hc.get(INDEED_RSS_URL, params={"q": q, "l": "remote", "sort": "date", "limit": 20})
                    if resp.status_code != 200:
                        continue
                    feed = feedparser.parse(resp.text)
                    for entry in feed.entries[:20]:
                        link = entry.get("link", "")
                        job_id = hashlib.md5(link.encode()).hexdigest()[:16]
                        title = entry.get("title", "")
                        company = ""
                        source_text = entry.get("source", "")
                        if hasattr(source_text, "value"):
                            company = source_text.value
                        elif isinstance(source_text, str):
                            company = source_text
                        desc = entry.get("summary", "") or entry.get("description", "") or ""
                        all_results.append({
                            "posting_id": f"indeed_{job_id}", "source_name": "indeed",
                            "source_job_id": job_id, "source_url": link,
                            "title": title, "company_name": company,
                            "location_text": "Remote", "is_remote": True,
                            "employment_type": "full-time",
                            "description": desc[:5000], "category": "", "tags": [],
                            "indexed_at": datetime.now(timezone.utc),
                        })
                except Exception:
                    continue
        return all_results
    except Exception as e:
        print(f"Indeed fetch error: {e}")
        return []

async def fetch_linkedin_jobs():
    try:
        results = []
        keywords_list = ["remote software engineer", "remote developer", "remote data"]
        async with httpx.AsyncClient(timeout=30, headers=SCRAPER_HEADERS, follow_redirects=True) as hc:
            for keywords in keywords_list:
                try:
                    resp = await hc.get(LINKEDIN_JOBS_URL, params={
                        "keywords": keywords, "location": "Worldwide",
                        "f_WT": "2", "start": "0", "count": "25",
                    })
                    if resp.status_code != 200:
                        continue
                    html = resp.text
                    job_cards = re.findall(r'<li[^>]*>(.*?)</li>', html, re.DOTALL)
                    for card in job_cards[:25]:
                        title_match = re.search(r'class="base-search-card__title[^"]*"[^>]*>([^<]+)', card)
                        company_match = re.search(r'class="base-search-card__subtitle[^"]*"[^>]*>([^<]+)', card)
                        location_match = re.search(r'class="job-search-card__location[^"]*"[^>]*>([^<]+)', card)
                        link_match = re.search(r'href="(https://www\.linkedin\.com/jobs/view/[^"?]+)', card)
                        if not title_match:
                            continue
                        title = title_match.group(1).strip()
                        company = company_match.group(1).strip() if company_match else ""
                        location = location_match.group(1).strip() if location_match else "Remote"
                        link = link_match.group(1) if link_match else ""
                        job_id = hashlib.md5(f"{title}{company}".encode()).hexdigest()[:16]
                        results.append({
                            "posting_id": f"linkedin_{job_id}", "source_name": "linkedin",
                            "source_job_id": job_id, "source_url": link,
                            "title": title, "company_name": company,
                            "location_text": location, "is_remote": "remote" in location.lower(),
                            "employment_type": "full-time",
                            "description": f"{title} at {company} - {location}",
                            "category": "", "tags": [],
                            "indexed_at": datetime.now(timezone.utc),
                        })
                except Exception:
                    continue
        return results
    except Exception as e:
        print(f"LinkedIn fetch error: {e}")
        return []

async def fetch_github_jobs():
    try:
        async with httpx.AsyncClient(timeout=30, headers=SCRAPER_HEADERS, follow_redirects=True) as hc:
            resp = await hc.get("https://www.arbeitnow.com/api/job-board-api", params={"page": "1"})
            if resp.status_code != 200:
                return []
            data = resp.json()
        results = []
        for j in data.get("data", [])[:50]:
            job_id = str(j.get("slug", "")) or hashlib.md5(j.get("title", "").encode()).hexdigest()[:16]
            is_remote = j.get("remote", False)
            results.append({
                "posting_id": f"github_{job_id[:40]}", "source_name": "github_jobs",
                "source_job_id": job_id[:40], "source_url": j.get("url", ""),
                "title": j.get("title", ""), "company_name": j.get("company_name", ""),
                "location_text": j.get("location", ""), "is_remote": is_remote,
                "employment_type": "full-time",
                "description": (j.get("description", "") or "")[:5000],
                "category": "", "tags": j.get("tags", []),
                "indexed_at": datetime.now(timezone.utc),
            })
        return results
    except Exception as e:
        print(f"GitHub Jobs fetch error: {e}")
        return []

JOB_SOURCES = [
    ("remotive", fetch_remotive_jobs),
    ("weworkremotely", fetch_weworkremotely_jobs),
    ("hackernews", fetch_hackernews_jobs),
    ("indeed", fetch_indeed_jobs),
    ("linkedin", fetch_linkedin_jobs),
    ("github_jobs", fetch_github_jobs),
]

async def ingest_jobs():
    all_jobs = []
    sources_results = []
    for name, fetcher in JOB_SOURCES:
        try:
            jobs = await fetcher()
        except Exception as e:
            print(f"Source {name} failed: {e}")
            jobs = []
        inserted = 0
        for job in jobs:
            try:
                await db.job_postings.update_one(
                    {"source_name": job["source_name"], "source_job_id": job["source_job_id"]},
                    {"$set": job}, upsert=True)
                inserted += 1
            except Exception:
                pass
        all_jobs.extend(jobs)
        await db.ingestion_runs.insert_one({
            "run_id": f"run_{uuid.uuid4().hex[:12]}", "source": name,
            "started_at": datetime.now(timezone.utc), "completed_at": datetime.now(timezone.utc),
            "fetched_count": len(jobs), "inserted_count": inserted,
        })
        sources_results.append({"source": name, "fetched": len(jobs), "inserted": inserted})
    return {"sources": sources_results, "total_fetched": len(all_jobs)}

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
    return await ingest_jobs()

@app.get("/api/ingestion/stats")
async def ingestion_stats(user=Depends(get_current_user)):
    runs = await db.ingestion_runs.find({}, {"_id": 0}).sort("completed_at", -1).limit(20).to_list(20)
    total_jobs = await db.job_postings.count_documents({})
    by_source = {}
    async for doc in db.job_postings.aggregate([{"$group": {"_id": "$source_name", "count": {"$sum": 1}}}]):
        by_source[doc["_id"]] = doc["count"]
    return {"recent_runs": runs, "total_jobs_indexed": total_jobs, "by_source": by_source}

# ── Health ───────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
