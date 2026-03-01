#!/usr/bin/env bash
set -euo pipefail

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not installed/in PATH." >&2
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-postgresql://ezjob:ezjob@127.0.0.1:5432/ezjob}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8000}"
DEMO_EMAIL="${DEMO_EMAIL:-demo.user@ezjob.local}"
FIXTURE_SOURCE_NAME="${FIXTURE_SOURCE_NAME:-fixture_demo}"
FIXTURE_SOURCE_JOB_ID="${FIXTURE_SOURCE_JOB_ID:-fixture-rem-001}"

psql_query() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1"
}

echo "Seeding deterministic demo data..."

USER_ID="$(psql_query "
WITH upserted AS (
  INSERT INTO users (email, password_hash)
  VALUES ('${DEMO_EMAIL}', NULL)
  ON CONFLICT (email)
  DO UPDATE SET updated_at = CURRENT_TIMESTAMP
  RETURNING id
)
SELECT id FROM upserted
UNION ALL
SELECT id FROM users WHERE email = '${DEMO_EMAIL}'
LIMIT 1;")"

if [[ -z "$USER_ID" ]]; then
  echo "Failed to resolve demo user id" >&2
  exit 1
fi

JOB_POSTING_ID="$(psql_query "
SELECT id
FROM job_postings
WHERE source_name = '${FIXTURE_SOURCE_NAME}'
  AND source_job_id = '${FIXTURE_SOURCE_JOB_ID}'
LIMIT 1;")"

if [[ -z "$JOB_POSTING_ID" ]]; then
  JOB_POSTING_ID="$(psql_query "
INSERT INTO job_postings (
  source_name,
  source_job_id,
  source_url,
  title,
  company_name,
  location_text,
  location_country,
  is_remote,
  employment_type,
  seniority_level,
  salary_min,
  salary_max,
  salary_currency,
  posted_at,
  description
) VALUES (
  '${FIXTURE_SOURCE_NAME}',
  '${FIXTURE_SOURCE_JOB_ID}',
  'https://demo.ezjob.local/jobs/${FIXTURE_SOURCE_JOB_ID}',
  'Senior TypeScript Engineer',
  'DemoWorks',
  'Remote - US',
  'United States',
  true,
  'full_time',
  'senior',
  150000,
  185000,
  'USD',
  CURRENT_TIMESTAMP,
  'Deterministic fixture posting inserted by scripts/demo/seed-demo-data.sh'
)
RETURNING id;")"
fi

MATCH_RESULT_ID="$(psql_query "
INSERT INTO match_results (
  user_id,
  job_posting_id,
  score,
  reason_summary,
  reason_details
)
VALUES (
  '${USER_ID}'::uuid,
  '${JOB_POSTING_ID}'::uuid,
  92.50,
  'Strong TypeScript, remote-friendly profile fit',
  '["TypeScript backend experience", "Remote preference aligns", "Salary in preferred range"]'::jsonb
)
ON CONFLICT (user_id, job_posting_id, resume_variant_id)
DO UPDATE SET
  score = EXCLUDED.score,
  reason_summary = EXCLUDED.reason_summary,
  reason_details = EXCLUDED.reason_details,
  created_at = CURRENT_TIMESTAMP
RETURNING id;")"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO user_preferences (
  user_id,
  desired_titles,
  preferred_locations,
  remote_only,
  notifications_enabled,
  max_notifications_per_hour,
  quiet_hours_start,
  quiet_hours_end,
  time_zone
)
VALUES (
  '${USER_ID}'::uuid,
  ARRAY['Software Engineer', 'Backend Engineer'],
  ARRAY['Remote'],
  true,
  true,
  60,
  NULL,
  NULL,
  'UTC'
)
ON CONFLICT (user_id)
DO UPDATE SET
  notifications_enabled = EXCLUDED.notifications_enabled,
  max_notifications_per_hour = EXCLUDED.max_notifications_per_hour,
  quiet_hours_start = EXCLUDED.quiet_hours_start,
  quiet_hours_end = EXCLUDED.quiet_hours_end,
  time_zone = EXCLUDED.time_zone,
  updated_at = CURRENT_TIMESTAMP;
SQL

echo ""
echo "Demo seed complete."
echo "USER_ID=$USER_ID"
echo "JOB_POSTING_ID=$JOB_POSTING_ID"
echo "MATCH_RESULT_ID=$MATCH_RESULT_ID"
echo ""
echo "Trigger Telegram/console notification:"
echo "curl -X POST \"${API_BASE_URL}/notifications/match-alerts/send\" \\\"
echo "  -H 'content-type: application/json' \\\"
echo "  -d '{\"userId\":\"${USER_ID}\",\"matchResultId\":\"${MATCH_RESULT_ID}\"}'"
echo ""
echo "Inspect notifications:"
echo "curl \"${API_BASE_URL}/users/${USER_ID}/notifications\""
echo ""
echo "Inspect funnel:"
echo "curl \"${API_BASE_URL}/users/${USER_ID}/funnel\""
