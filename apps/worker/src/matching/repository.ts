import pg from "pg";
import type { MatchResultRecord } from "./types.js";

const { Pool } = pg;

export interface MatchResultRepository {
  save(result: MatchResultRecord): Promise<string>;
}

export class PostgresMatchResultRepository implements MatchResultRepository {
  private readonly pool: pg.Pool;

  constructor(databaseUrl = process.env.DATABASE_URL) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for PostgresMatchResultRepository");
    }

    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async save(result: MatchResultRecord): Promise<string> {
    const reasonDetails = {
      ...result.reasonDetails,
      decision: result.decision,
      reasonCodes: [
        ...result.reasonDetails.hardFilterFailures.map((reason) => reason.code),
        ...result.reasonDetails.reasons.map((reason) => reason.code)
      ]
    };

    const queryResult = await this.pool.query<{ id: string }>(
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
      RETURNING id
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

    return queryResult.rows[0].id;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
