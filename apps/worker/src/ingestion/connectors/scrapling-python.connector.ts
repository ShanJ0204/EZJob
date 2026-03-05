import { normalizeJobPosting, type JobPosting } from "@ezjob/common";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { ConnectorFetchResult, IngestionConnector } from "../types.js";

type ScraplingJob = {
  id: string;
  url: string;
  title: string;
  company_name: string;
  location?: string;
  posted_at?: string;
  description?: string;
};

type ScraplingPayload = {
  sourceName: string;
  jobs: ScraplingJob[];
  errors: string[];
};

const execFileAsync = promisify(execFile);

export class ScraplingPythonConnector implements IngestionConnector {
  public readonly sourceName = "scrapling";
  public readonly sourceType = "scraper" as const;

  async fetchPostings(): Promise<ConnectorFetchResult> {
    const errors: string[] = [];
    const jobs: JobPosting[] = [];

    try {
      const pythonBin = process.env.SCRAPLING_PYTHON_BIN ?? "python3";
      const scriptPath = resolve(
        process.cwd(),
        process.env.SCRAPLING_SCRIPT_PATH ?? "apps/worker/src/ingestion/connectors/scripts/scrapling_weworkremotely.py"
      );
      const targetUrl = process.env.SCRAPLING_TARGET_URL ?? "https://weworkremotely.com/remote-jobs";

      const { stdout } = await execFileAsync(pythonBin, [scriptPath, "--url", targetUrl], {
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024
      });

      const payload = JSON.parse(stdout) as ScraplingPayload;
      errors.push(...(payload.errors ?? []).map((error) => `scrapling:${error}`));

      for (const job of payload.jobs ?? []) {
        try {
          jobs.push(
            normalizeJobPosting({
              sourceName: this.sourceName,
              sourceJobId: job.id,
              sourceUrl: job.url,
              title: job.title,
              companyName: job.company_name,
              locationText: job.location ?? "Remote",
              locationCountry: job.location ?? "Remote",
              isRemote: true,
              postedAt: job.posted_at,
              description: job.description
            })
          );
        } catch (error) {
          errors.push(`normalize:${job.id}:${error instanceof Error ? error.message : String(error)}`);
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
