import pg from "pg";

const { Pool } = pg;

export type ApplicationAttemptStatus = "queued" | "processing" | "succeeded" | "failed";

export interface UpdateAttemptInput {
  id: string;
  status: ApplicationAttemptStatus;
  requestArtifactUri?: string;
  errorArtifactUri?: string;
}

export class PostgresApplicationAttemptRepository {
  private readonly pool: pg.Pool;

  public constructor(databaseUrl = process.env.DATABASE_URL) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for PostgresApplicationAttemptRepository");
    }

    this.pool = new Pool({ connectionString: databaseUrl });
  }

  public async updateStatus(input: UpdateAttemptInput): Promise<void> {
    const shouldSetCompletedAt = input.status === "succeeded" || input.status === "failed";

    await this.pool.query(
      `
      UPDATE application_attempts
      SET
        status = $2,
        request_artifact_uri = COALESCE($3, request_artifact_uri),
        error_artifact_uri = COALESCE($4, error_artifact_uri),
        completed_at = CASE
          WHEN $5::boolean THEN now()
          ELSE completed_at
        END,
        updated_at = now()
      WHERE id = $1
      `,
      [
        input.id,
        input.status,
        input.requestArtifactUri ?? null,
        input.errorArtifactUri ?? null,
        shouldSetCompletedAt,
      ],
    );
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
