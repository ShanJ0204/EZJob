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
          posting.description,
          JSON.stringify({ normalizedKey: posting.normalizedKey, dedupSignature: posting.dedupSignature })
        ]
      );

      if (result.rows[0]?.inserted) {
        inserted += 1;
      }
    }

    return inserted;
  }

  async saveRun(metadata: IngestionRunMetadata): Promise<void> {
    await this.pool.query(
      `
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
      `,
      [
        metadata.source,
        metadata.sourceType,
        new Date(metadata.startedAt),
        new Date(metadata.completedAt),
        metadata.durationMs,
        metadata.fetchedCount,
        metadata.insertedCount,
        metadata.exactDuplicateCount,
        metadata.fuzzyDuplicateCount,
        JSON.stringify(metadata.errors)
      ]
    );
  }
}
