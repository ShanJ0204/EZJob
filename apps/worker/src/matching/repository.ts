import pg from "pg";
import type { MatchResultRecord } from "./types.js";

const { Pool } = pg;

export interface MatchResultRepository {
  save(result: MatchResultRecord): Promise<void>;
}

export class PostgresMatchResultRepository implements MatchResultRepository {
  private readonly pool: pg.Pool;

  constructor(databaseUrl = process.env.DATABASE_URL) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for PostgresMatchResultRepository");
    }

    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async save(result: MatchResultRecord): Promise<void> {
    const reasonDetails = {
      ...result.reasonDetails,
      decision: result.decision,
      reasonCodes: [
        ...result.reasonDetails.hardFilterFailures.map((reason) => reason.code),
        ...result.reasonDetails.reasons.map((reason) => reason.code)
      ]
    };

    await this.pool.query(
      `
      INSERT INTO match_results (
        user_id,
        job_posting_id,
        resume_variant_id,
        score,
        reason_summary,
        reason_details
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (user_id, job_posting_id, resume_variant_id)
      DO UPDATE SET
        score = EXCLUDED.score,
        reason_summary = EXCLUDED.reason_summary,
        reason_details = EXCLUDED.reason_details,
        created_at = now()
      `,
      [
        result.userId,
        result.jobPostingId,
        result.resumeVariantId ?? null,
        result.score,
        result.reasonSummary,
        JSON.stringify(reasonDetails)
      ]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
