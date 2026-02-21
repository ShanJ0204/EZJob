<<<<<<< codex/explore-feasibility-of-job-scraping-bot
import pg from "pg";
import { buildDedupSignature, buildNormalizedKey, JobPosting } from "@ezjob/common";

import type { IngestionRepository, IngestionRunMetadata } from "../types.js";

const { Pool } = pg;

export class PostgresIngestionRepository implements IngestionRepository {
  private readonly pool: pg.Pool;

  constructor(databaseUrl = process.env.DATABASE_URL) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for PostgresIngestionRepository");
    }

    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async getAllPostings(): Promise<JobPosting[]> {
    const result = await this.pool.query(
      `
=======
import {
  JobPosting,
  buildDedupSignature,
  buildNormalizedKey,
  type JobPosting as JobPostingType
} from "@ezjob/common";
import { Pool } from "pg";
import type { IngestionRunMetadata } from "../types.js";

const UPSERT_POSTING_SQL = `
  INSERT INTO job_postings (
    source_name,
    source_job_id,
    source_url,
    title,
    company_name,
    location_text,
    location_city,
    location_state,
    location_country,
    is_remote,
    employment_type,
    seniority_level,
    salary_min,
    salary_max,
    salary_currency,
    posted_at,
    description,
    indexed_at,
    updated_at
  ) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15,
    $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT (source_name, source_job_id)
  DO UPDATE SET
    source_url = EXCLUDED.source_url,
    title = EXCLUDED.title,
    company_name = EXCLUDED.company_name,
    location_text = EXCLUDED.location_text,
    location_city = EXCLUDED.location_city,
    location_state = EXCLUDED.location_state,
    location_country = EXCLUDED.location_country,
    is_remote = EXCLUDED.is_remote,
    employment_type = EXCLUDED.employment_type,
    seniority_level = EXCLUDED.seniority_level,
    salary_min = EXCLUDED.salary_min,
    salary_max = EXCLUDED.salary_max,
    salary_currency = EXCLUDED.salary_currency,
    posted_at = EXCLUDED.posted_at,
    description = EXCLUDED.description,
    indexed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  RETURNING (xmax = 0) AS inserted;
`;

interface UpsertStats {
  insertedCount: number;
  conflictCount: number;
}

export class PostgresIngestionRepository {
  private readonly pool: Pool;

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for ingestion repository");
    }

    this.pool = new Pool({
      connectionString,
      allowExitOnIdle: true
    });
  }

  async getAllPostings(): Promise<JobPostingType[]> {
    const result = await this.pool.query<{
      source_name: string;
      source_job_id: string;
      source_url: string | null;
      title: string;
      company_name: string;
      location_text: string | null;
      location_city: string | null;
      location_state: string | null;
      location_country: string | null;
      is_remote: boolean;
      employment_type: JobPostingType["employmentType"] | null;
      seniority_level: string | null;
      salary_min: number | null;
      salary_max: number | null;
      salary_currency: string | null;
      posted_at: Date | null;
      description: string | null;
    }>(`
>>>>>>> main
      SELECT
        source_name,
        source_job_id,
        source_url,
        title,
        company_name,
        location_text,
        location_city,
        location_state,
        location_country,
        is_remote,
        employment_type,
        seniority_level,
        salary_min,
        salary_max,
        salary_currency,
        posted_at,
        description
      FROM job_postings
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
      `
    );

    return result.rows.map((row) =>
      JobPosting.parse({
        sourceName: String(row.source_name),
        sourceJobId: String(row.source_job_id),
        sourceUrl: String(row.source_url ?? "https://example.invalid"),
        title: String(row.title),
        companyName: String(row.company_name),
        locationText: String(row.location_text ?? ""),
        locationCity: row.location_city ? String(row.location_city) : undefined,
        locationState: row.location_state ? String(row.location_state) : undefined,
        locationCountry: row.location_country ? String(row.location_country) : undefined,
        isRemote: Boolean(row.is_remote),
        employmentType: row.employment_type ?? undefined,
        seniorityLevel: row.seniority_level ? String(row.seniority_level) : undefined,
        salaryMin: row.salary_min ?? undefined,
        salaryMax: row.salary_max ?? undefined,
        salaryCurrency: row.salary_currency ? String(row.salary_currency) : undefined,
        postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : undefined,
        description: String(row.description ?? ""),
        normalizedKey: buildNormalizedKey(String(row.source_name), String(row.source_job_id)),
        dedupSignature: buildDedupSignature(
          String(row.title),
          String(row.company_name),
          row.location_text ? String(row.location_text) : ""
        )
      })
    );
  }

  async savePostings(postings: JobPosting[]): Promise<number> {
    if (postings.length === 0) {
      return 0;
    }

    let inserted = 0;

    for (const posting of postings) {
      const result = await this.pool.query(
        `
        INSERT INTO job_postings (
          source_name,
          source_job_id,
          source_url,
          title,
          company_name,
          location_text,
          location_city,
          location_state,
          location_country,
          is_remote,
          employment_type,
          seniority_level,
          salary_min,
          salary_max,
          salary_currency,
          posted_at,
          description,
          source_payload,
          indexed_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,now(),now(),now()
        )
        ON CONFLICT (source_name, source_job_id)
        DO UPDATE SET
          source_url = EXCLUDED.source_url,
          title = EXCLUDED.title,
          company_name = EXCLUDED.company_name,
          location_text = EXCLUDED.location_text,
          location_city = EXCLUDED.location_city,
          location_state = EXCLUDED.location_state,
          location_country = EXCLUDED.location_country,
          is_remote = EXCLUDED.is_remote,
          employment_type = EXCLUDED.employment_type,
          seniority_level = EXCLUDED.seniority_level,
          salary_min = EXCLUDED.salary_min,
          salary_max = EXCLUDED.salary_max,
          salary_currency = EXCLUDED.salary_currency,
          posted_at = EXCLUDED.posted_at,
          description = EXCLUDED.description,
          source_payload = EXCLUDED.source_payload,
          indexed_at = now(),
          updated_at = now()
        RETURNING (xmax = 0) AS inserted
        `,
        [
=======
      WHERE source_url IS NOT NULL
    `);

    return result.rows.map((row) =>
      JobPosting.parse({
        sourceName: row.source_name,
        sourceJobId: row.source_job_id,
        sourceUrl: row.source_url,
        title: row.title,
        companyName: row.company_name,
        locationText: row.location_text ?? "",
        locationCity: row.location_city ?? undefined,
        locationState: row.location_state ?? undefined,
        locationCountry: row.location_country ?? undefined,
        isRemote: row.is_remote,
        employmentType: row.employment_type ?? undefined,
        seniorityLevel: row.seniority_level ?? undefined,
        salaryMin: row.salary_min ?? undefined,
        salaryMax: row.salary_max ?? undefined,
        salaryCurrency: row.salary_currency ?? undefined,
        postedAt: row.posted_at?.toISOString(),
        description: row.description ?? "",
        normalizedKey: buildNormalizedKey(row.source_name, row.source_job_id),
        dedupSignature: buildDedupSignature(row.title, row.company_name, row.location_text ?? "")
      })
    );
  }

  async upsertPostings(postings: JobPostingType[]): Promise<UpsertStats> {
    if (postings.length === 0) {
      return { insertedCount: 0, conflictCount: 0 };
    }

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      let insertedCount = 0;

      for (const posting of postings) {
        const upsertResult = await client.query<{ inserted: boolean }>(UPSERT_POSTING_SQL, [
>>>>>>> main
          posting.sourceName,
          posting.sourceJobId,
          posting.sourceUrl,
          posting.title,
          posting.companyName,
          posting.locationText,
          posting.locationCity ?? null,
          posting.locationState ?? null,
          posting.locationCountry ?? null,
          posting.isRemote,
          posting.employmentType ?? null,
          posting.seniorityLevel ?? null,
          posting.salaryMin ?? null,
          posting.salaryMax ?? null,
          posting.salaryCurrency ?? null,
          posting.postedAt ? new Date(posting.postedAt) : null,
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
          posting.description,
          JSON.stringify({ normalizedKey: posting.normalizedKey, dedupSignature: posting.dedupSignature })
        ]
      );

      if (result.rows[0]?.inserted) {
        inserted += 1;
      }
    }

    return inserted;
=======
          posting.description
        ]);

        if (upsertResult.rows[0]?.inserted) {
          insertedCount += 1;
        }
      }

      await client.query("COMMIT");

      return {
        insertedCount,
        conflictCount: postings.length - insertedCount
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
>>>>>>> main
  }

  async saveRun(metadata: IngestionRunMetadata): Promise<void> {
    await this.pool.query(
      `
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
      INSERT INTO ingestion_runs (
        source,
        source_type,
        started_at,
        completed_at,
        duration_ms,
        fetched_count,
        inserted_count,
        exact_duplicate_count,
        fuzzy_duplicate_count,
        errors
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
=======
        INSERT INTO ingestion_runs (
          source,
          source_type,
          started_at,
          completed_at,
          duration_ms,
          fetched_count,
          inserted_count,
          exact_duplicate_count,
          fuzzy_duplicate_count,
          db_duplicate_count,
          errors,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
>>>>>>> main
      `,
      [
        metadata.source,
        metadata.sourceType,
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
        new Date(metadata.startedAt),
        new Date(metadata.completedAt),
=======
        metadata.startedAt,
        metadata.completedAt,
>>>>>>> main
        metadata.durationMs,
        metadata.fetchedCount,
        metadata.insertedCount,
        metadata.exactDuplicateCount,
        metadata.fuzzyDuplicateCount,
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
=======
        metadata.dbDuplicateCount,
>>>>>>> main
        JSON.stringify(metadata.errors)
      ]
    );
  }
}
