import type { JobPosting } from "@ezjob/common";

export type ConnectorType = "api" | "rss";

export interface ConnectorFetchResult {
  sourceName: string;
  jobs: JobPosting[];
  errors: string[];
}

export interface IngestionConnector {
  readonly sourceName: string;
  readonly sourceType: ConnectorType;
  fetchPostings(): Promise<ConnectorFetchResult>;
}

export interface IngestionRunMetadata {
  source: string;
  sourceType: ConnectorType;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  fetchedCount: number;
  insertedCount: number;
  exactDuplicateCount: number;
  fuzzyDuplicateCount: number;
  errors: string[];
}

export interface IngestionRepository {
  getAllPostings(): Promise<JobPosting[]>;
  savePostings(postings: JobPosting[]): Promise<number>;
  saveRun(metadata: IngestionRunMetadata): Promise<void>;
}
