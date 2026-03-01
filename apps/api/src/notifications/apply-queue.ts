import { Queue, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES } from "@ezjob/common";

export interface ApplyJobPayload {
  applicationAttemptId: string;
  matchResultId: string;
  userId: string;
  resumeVariantId?: string;
}

export interface ApplyQueuePublisher {
  publishApply(payload: ApplyJobPayload): Promise<void>;
  close(): Promise<void>;
}

export class BullApplyQueuePublisher implements ApplyQueuePublisher {
  private readonly queue: Queue<ApplyJobPayload>;

  public constructor(redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379") {
    const connection = {
      url: redisUrl,
      maxRetriesPerRequest: null
    } satisfies ConnectionOptions;

    this.queue = new Queue<ApplyJobPayload>(QUEUE_NAMES.apply, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1_000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }

  public async publishApply(payload: ApplyJobPayload): Promise<void> {
    await this.queue.add("assisted-apply", payload, {
      jobId: `apply:${payload.applicationAttemptId}`,
    });
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}

export class NoopApplyQueuePublisher implements ApplyQueuePublisher {
  public async publishApply(): Promise<void> {
    return;
  }

  public async close(): Promise<void> {
    return;
  }
}
