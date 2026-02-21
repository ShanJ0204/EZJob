import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JobPosting } from "@ezjob/common";
import type { IngestionRepository, IngestionRunMetadata } from "../types.js";

type IngestionStore = {
  postings: JobPosting[];
  runs: IngestionRunMetadata[];
};

const EMPTY_STORE: IngestionStore = {
  postings: [],
  runs: []
};

export class FileIngestionRepository implements IngestionRepository {
  constructor(private readonly storeFilePath: string) {}

  async getAllPostings(): Promise<JobPosting[]> {
    const store = await this.readStore();
    return store.postings;
  }

  async savePostings(postings: JobPosting[]): Promise<number> {
    if (postings.length === 0) {
      return 0;
    }

    const store = await this.readStore();
    store.postings.push(...postings);
    await this.writeStore(store);
    return postings.length;
  }

  async saveRun(metadata: IngestionRunMetadata): Promise<void> {
    const store = await this.readStore();
    store.runs.push(metadata);
    await this.writeStore(store);
  }

  private async readStore(): Promise<IngestionStore> {
    try {
      const raw = await readFile(this.storeFilePath, "utf-8");
      const parsed = JSON.parse(raw) as IngestionStore;
      return {
        postings: Array.isArray(parsed.postings)
          ? parsed.postings.map((posting) => JobPosting.parse(posting))
          : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : []
      };
    } catch {
      return EMPTY_STORE;
    }
  }

  private async writeStore(data: IngestionStore): Promise<void> {
    await mkdir(path.dirname(this.storeFilePath), { recursive: true });
    await writeFile(this.storeFilePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
