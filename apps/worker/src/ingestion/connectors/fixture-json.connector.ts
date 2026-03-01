import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeJobPosting, type JobPosting } from "@ezjob/common";

import type { ConnectorFetchResult, IngestionConnector } from "../types.js";

type FixturePosting = {
  sourceJobId: string;
  sourceUrl: string;
  title: string;
  companyName: string;
  locationText: string;
  locationCountry?: string;
  isRemote?: boolean;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | "temporary" | "other";
  seniorityLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  description?: string;
  postedAt?: string;
};

const DEFAULT_FIXTURE_PATH = resolve(
  process.cwd(),
  "apps/worker/src/ingestion/connectors/fixtures/demo-jobs.json"
);

export class FixtureJsonConnector implements IngestionConnector {
  public readonly sourceName = "fixture_demo";
  public readonly sourceType = "api" as const;

  public constructor(private readonly fixturePath = process.env.INGESTION_FIXTURE_FILE ?? DEFAULT_FIXTURE_PATH) {}

  public async fetchPostings(): Promise<ConnectorFetchResult> {
    const errors: string[] = [];
    const jobs: JobPosting[] = [];

    try {
      const raw = await readFile(this.fixturePath, "utf8");
      const parsed = JSON.parse(raw) as FixturePosting[];

      for (const posting of parsed) {
        try {
          jobs.push(
            normalizeJobPosting({
              sourceName: this.sourceName,
              sourceJobId: posting.sourceJobId,
              sourceUrl: posting.sourceUrl,
              title: posting.title,
              companyName: posting.companyName,
              locationText: posting.locationText,
              locationCountry: posting.locationCountry,
              isRemote: posting.isRemote ?? true,
              employmentType: posting.employmentType,
              seniorityLevel: posting.seniorityLevel,
              salaryMin: posting.salaryMin,
              salaryMax: posting.salaryMax,
              salaryCurrency: posting.salaryCurrency,
              postedAt: posting.postedAt,
              description: posting.description
            })
          );
        } catch (error) {
          errors.push(
            `normalize:${posting.sourceJobId}:${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } catch (error) {
      errors.push(`fixture:${this.fixturePath}:${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      sourceName: this.sourceName,
      jobs,
      errors
    };
  }
}
