import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import type { JobPosting } from "@ezjob/common";

import { FixtureJsonConnector } from "./connectors/fixture-json.connector.js";
import { IngestionService } from "./service.js";
import type { IngestionRunMetadata } from "./types.js";

class InMemoryIngestionRepository {
  private readonly runs: IngestionRunMetadata[] = [];

  async getAllPostings(): Promise<JobPosting[]> {
    return [];
  }

  async upsertPostings(postings: JobPosting[]): Promise<{ insertedCount: number; conflictCount: number }> {
    return {
      insertedCount: postings.length,
      conflictCount: 0
    };
  }

  async saveRun(metadata: IngestionRunMetadata): Promise<void> {
    this.runs.push(metadata);
  }

  getSavedRuns(): IngestionRunMetadata[] {
    return this.runs;
  }
}

test("fixture ingestion smoke test writes expected run metadata", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ezjob-worker-fixture-"));
  const fixtureFile = path.join(tempDir, "fixture.json");

  await writeFile(
    fixtureFile,
    JSON.stringify(
      [
        {
          sourceJobId: "fixture-1",
          sourceUrl: "https://example.com/jobs/fixture-1",
          title: "Backend Engineer",
          companyName: "Example Inc",
          locationText: "Remote",
          description: "Node.js and TypeScript"
        }
      ],
      null,
      2
    )
  );

  const repository = new InMemoryIngestionRepository();
  const service = new IngestionService([new FixtureJsonConnector(fixtureFile)], repository);

  const runs = await service.runOnce("smoke-cycle-1");

  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.source, "fixture_demo");
  assert.equal(runs[0]?.fetchedCount, 1);
  assert.equal(runs[0]?.insertedCount, 1);
  assert.deepEqual(runs[0]?.errors, []);
  assert.equal(repository.getSavedRuns().length, 1);
});
