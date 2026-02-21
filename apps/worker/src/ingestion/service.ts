import path from "node:path";
import type { IngestionConnector, IngestionRepository, IngestionRunMetadata } from "./types.js";
import { deduplicatePostings } from "./dedup.js";
import { FileIngestionRepository } from "./storage/file-ingestion.repository.js";
import { PostgresIngestionRepository } from "./storage/postgres-ingestion.repository.js";

const resolveIngestionRepository = (): IngestionRepository => {
  const driver = (process.env.INGESTION_STORE_DRIVER ?? "postgres").toLowerCase();
  if (driver === "file") {
    return new FileIngestionRepository(path.resolve(process.cwd(), "apps/worker/.data/ingestion-store.json"));
  }

  return new PostgresIngestionRepository(process.env.DATABASE_URL);
};

export class IngestionService {
  constructor(
    private readonly connectors: IngestionConnector[],
    private readonly repository: IngestionRepository = resolveIngestionRepository()
  ) {}

  async runOnce(): Promise<IngestionRunMetadata[]> {
    const existing = await this.repository.getAllPostings();
    const runResults: IngestionRunMetadata[] = [];

    for (const connector of this.connectors) {
      const startedAt = Date.now();
      const result = await connector.fetchPostings();
      const dedup = deduplicatePostings(result.jobs, existing);
      const insertedCount = await this.repository.savePostings(dedup.unique);
      existing.push(...dedup.unique);

      const completedAt = Date.now();
      const metadata: IngestionRunMetadata = {
        source: connector.sourceName,
        sourceType: connector.sourceType,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        durationMs: completedAt - startedAt,
        fetchedCount: result.jobs.length,
        insertedCount,
        exactDuplicateCount: dedup.exactDuplicateCount,
        fuzzyDuplicateCount: dedup.fuzzyDuplicateCount,
        errors: result.errors
      };

      await this.repository.saveRun(metadata);
      runResults.push(metadata);
    }

    return runResults;
  }
}
