import path from "node:path";
import type { IngestionConnector, IngestionRunMetadata } from "./types.js";
import { deduplicatePostings } from "./dedup.js";
import { FileIngestionRepository } from "./storage/file-ingestion.repository.js";

export class IngestionService {
  private readonly repository = new FileIngestionRepository(
    path.resolve(process.cwd(), "apps/worker/.data/ingestion-store.json")
  );

  constructor(private readonly connectors: IngestionConnector[]) {}

  async runOnce(): Promise<IngestionRunMetadata[]> {
    const existing = await this.repository.getAllPostings();
    const runResults: IngestionRunMetadata[] = [];

    for (const connector of this.connectors) {
      const startedAt = Date.now();
      const result = await connector.fetchPostings();
      const dedup = deduplicatePostings(result.jobs, existing);
      await this.repository.savePostings(dedup.unique);
      existing.push(...dedup.unique);

      const completedAt = Date.now();
      const metadata: IngestionRunMetadata = {
        source: connector.sourceName,
        sourceType: connector.sourceType,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        durationMs: completedAt - startedAt,
        fetchedCount: result.jobs.length,
        insertedCount: dedup.unique.length,
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
