<<<<<<< codex/explore-feasibility-of-job-scraping-bot
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
=======
import type { IngestionConnector, IngestionRunMetadata } from "./types.js";
import { deduplicatePostings } from "./dedup.js";
import { PostgresIngestionRepository } from "./storage/postgres-ingestion.repository.js";

export class IngestionService {
  private readonly repository = new PostgresIngestionRepository();
>>>>>>> main

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
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
      const insertedCount = await this.repository.savePostings(dedup.unique);
=======
      const upsertStats = await this.repository.upsertPostings(dedup.unique);
>>>>>>> main
      existing.push(...dedup.unique);

      const completedAt = Date.now();
      const metadata: IngestionRunMetadata = {
        source: connector.sourceName,
        sourceType: connector.sourceType,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        durationMs: completedAt - startedAt,
        fetchedCount: result.jobs.length,
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
        insertedCount,
        exactDuplicateCount: dedup.exactDuplicateCount,
=======
        insertedCount: upsertStats.insertedCount,
        exactDuplicateCount: dedup.exactDuplicateCount + upsertStats.conflictCount,
>>>>>>> main
        fuzzyDuplicateCount: dedup.fuzzyDuplicateCount,
        dbDuplicateCount: upsertStats.conflictCount,
        errors: result.errors
      };

      await this.repository.saveRun(metadata);
      runResults.push(metadata);
    }

    return runResults;
  }
}
