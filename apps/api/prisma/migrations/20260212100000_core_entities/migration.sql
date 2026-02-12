CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "desired_titles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "preferred_locations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "remote_only" BOOLEAN NOT NULL DEFAULT false,
    "min_salary" INTEGER,
    "max_salary" INTEGER,
    "employment_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "candidate_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "phone" TEXT,
    "linkedin_url" TEXT,
    "github_url" TEXT,
    "years_experience" DECIMAL(4,1),
    "summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resume_masters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "candidate_profile_id" UUID,
    "title" TEXT NOT NULL,
    "storage_uri" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "parsed_text" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_masters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resume_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resume_master_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "target_role" TEXT,
    "content_uri" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_postings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_name" TEXT NOT NULL,
    "source_job_id" TEXT NOT NULL,
    "source_url" TEXT,
    "source_payload" JSONB,
    "title" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "location_text" TEXT,
    "location_city" TEXT,
    "location_state" TEXT,
    "location_country" TEXT,
    "is_remote" BOOLEAN NOT NULL DEFAULT false,
    "employment_type" TEXT,
    "seniority_level" TEXT,
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "salary_currency" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "indexed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "match_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "job_posting_id" UUID NOT NULL,
    "resume_variant_id" UUID,
    "score" DECIMAL(5,2) NOT NULL,
    "reason_summary" TEXT,
    "reason_details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "match_result_id" UUID,
    "channel" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "job_posting_id" UUID NOT NULL,
    "resume_variant_id" UUID,
    "match_result_id" UUID,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "external_application_id" TEXT,
    "request_artifact_uri" TEXT,
    "response_artifact_uri" TEXT,
    "error_artifact_uri" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");
CREATE UNIQUE INDEX "candidate_profiles_user_id_key" ON "candidate_profiles"("user_id");
CREATE UNIQUE INDEX "resume_masters_user_id_checksum_key" ON "resume_masters"("user_id", "checksum");
CREATE UNIQUE INDEX "resume_variants_resume_master_id_content_hash_key" ON "resume_variants"("resume_master_id", "content_hash");
CREATE UNIQUE INDEX "job_postings_source_name_source_job_id_key" ON "job_postings"("source_name", "source_job_id");
CREATE UNIQUE INDEX "match_results_user_id_job_posting_id_resume_variant_id_key" ON "match_results"("user_id", "job_posting_id", "resume_variant_id");

CREATE INDEX "idx_resume_masters_user_created_at" ON "resume_masters"("user_id", "created_at" DESC);
CREATE INDEX "idx_resume_variants_user_created_at" ON "resume_variants"("user_id", "created_at" DESC);
CREATE INDEX "idx_job_postings_indexed_at" ON "job_postings"("indexed_at" DESC);
CREATE INDEX "idx_job_postings_posted_at" ON "job_postings"("posted_at" DESC);
CREATE INDEX "idx_job_postings_source_name" ON "job_postings"("source_name");
CREATE INDEX "idx_match_results_user_score_created" ON "match_results"("user_id", "score" DESC, "created_at" DESC);
CREATE INDEX "idx_match_results_job_posting" ON "match_results"("job_posting_id");
CREATE INDEX "idx_notification_events_user_status_created" ON "notification_events"("user_id", "status", "created_at" DESC);
CREATE INDEX "idx_application_attempts_user_status_attempted" ON "application_attempts"("user_id", "status", "attempted_at" DESC);
CREATE INDEX "idx_application_attempts_job_status" ON "application_attempts"("job_posting_id", "status");

ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_masters" ADD CONSTRAINT "resume_masters_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_masters" ADD CONSTRAINT "resume_masters_candidate_profile_id_fkey"
    FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_resume_master_id_fkey"
    FOREIGN KEY ("resume_master_id") REFERENCES "resume_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_job_posting_id_fkey"
    FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_resume_variant_id_fkey"
    FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_match_result_id_fkey"
    FOREIGN KEY ("match_result_id") REFERENCES "match_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "application_attempts" ADD CONSTRAINT "application_attempts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_attempts" ADD CONSTRAINT "application_attempts_job_posting_id_fkey"
    FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_attempts" ADD CONSTRAINT "application_attempts_resume_variant_id_fkey"
    FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "application_attempts" ADD CONSTRAINT "application_attempts_match_result_id_fkey"
    FOREIGN KEY ("match_result_id") REFERENCES "match_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
