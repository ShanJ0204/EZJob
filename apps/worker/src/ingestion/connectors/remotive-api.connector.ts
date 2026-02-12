import { normalizeJobPosting, type JobPosting } from "@ezjob/common";
import type { ConnectorFetchResult, IngestionConnector } from "../types.js";

type RemotiveResponse = {
  jobs: Array<{
    id: number;
    url: string;
    title: string;
    company_name: string;
    category?: string;
    salary?: string;
    publication_date?: string;
    description?: string;
    candidate_required_location?: string;
  }>;
};

export class RemotiveApiConnector implements IngestionConnector {
  public readonly sourceName = "remotive";
  public readonly sourceType = "api" as const;

  async fetchPostings(): Promise<ConnectorFetchResult> {
    const errors: string[] = [];
    const jobs: JobPosting[] = [];

    try {
      const response = await fetch("https://remotive.com/api/remote-jobs");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as RemotiveResponse;
      for (const job of payload.jobs ?? []) {
        try {
          jobs.push(
            normalizeJobPosting({
              sourceName: this.sourceName,
              sourceJobId: String(job.id),
              sourceUrl: job.url,
              title: job.title,
              companyName: job.company_name,
              locationText: job.candidate_required_location,
              locationCountry: job.candidate_required_location,
              isRemote: true,
              seniorityLevel: job.category,
              postedAt: job.publication_date,
              description: job.description
            })
          );
        } catch (error) {
          errors.push(`normalize:${String(job.id)}:${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      errors.push(`fetch:${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      sourceName: this.sourceName,
      jobs,
      errors
    };
  }
}
