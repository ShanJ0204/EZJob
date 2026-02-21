import { Queue } from "bullmq";
import { Redis } from "ioredis";
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
  private readonly connection: Redis;

  public constructor(redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379") {
    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue<ApplyJobPayload>(QUEUE_NAMES.apply, {
      connection: this.connection,
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
    await Promise.all([
      this.queue.close(),
      this.connection.quit(),
    ]);
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
