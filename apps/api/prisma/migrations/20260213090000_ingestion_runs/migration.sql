CREATE TABLE "ingestion_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "fetched_count" INTEGER NOT NULL,
    "inserted_count" INTEGER NOT NULL,
    "exact_duplicate_count" INTEGER NOT NULL,
    "fuzzy_duplicate_count" INTEGER NOT NULL,
    "errors" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_ingestion_runs_source_started_at"
  ON "ingestion_runs"("source", "started_at" DESC);
