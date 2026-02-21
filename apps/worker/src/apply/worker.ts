import type { Job } from "bullmq";

import { PostgresApplicationAttemptRepository } from "./repository.js";

export interface ApplyJobData {
  applicationAttemptId: string;
  matchResultId: string;
  userId: string;
  resumeVariantId?: string;
}

export class ApplyWorker {
  public constructor(private readonly repository = new PostgresApplicationAttemptRepository()) {}

  public async process(job: Job<ApplyJobData>): Promise<{ status: string }> {
    const requestArtifact = JSON.stringify({
      mode: "assisted_apply",
      step: "queued_for_manual_submission",
      matchResultId: job.data.matchResultId,
      userId: job.data.userId,
      resumeVariantId: job.data.resumeVariantId ?? null,
      processedAt: new Date().toISOString(),
    });

    await this.repository.updateStatus({
      id: job.data.applicationAttemptId,
      status: "processing",
      requestArtifactUri: requestArtifact,
    });

    try {
      await this.repository.updateStatus({
        id: job.data.applicationAttemptId,
        status: "succeeded",
        requestArtifactUri: requestArtifact,
      });

      return { status: "succeeded" };
    } catch (error) {
      await this.repository.updateStatus({
        id: job.data.applicationAttemptId,
        status: "failed",
        errorArtifactUri: JSON.stringify({
          message: error instanceof Error ? error.message : "Unknown apply worker error",
          stack: error instanceof Error ? error.stack : undefined,
          failedAt: new Date().toISOString(),
        }),
      });

      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.repository.close();
  }
}
