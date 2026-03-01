import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Queue, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE_NAMES } from "@ezjob/common";
import { RemotiveApiConnector } from "./ingestion/connectors/remotive-api.connector.js";
import { WeWorkRemotelyRssConnector } from "./ingestion/connectors/weworkremotely-rss.connector.js";
import { FixtureJsonConnector } from "./ingestion/connectors/fixture-json.connector.js";
import { IngestionService } from "./ingestion/service.js";
import type { IngestionRunMetadata } from "./ingestion/types.js";
import { MatchingWorker, type NotificationJobData } from "./matching/index.js";
import { ApplyWorker, type ApplyJobData } from "./apply/worker.js";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
const ingestionPollIntervalMs = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? 60_000);
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const orchestratorLockKey = process.env.ORCHESTRATION_LOCK_KEY ?? "ezjob:worker:orchestration:lock";
const instanceId = process.env.WORKER_INSTANCE_ID ?? randomUUID();
const ingestionMode = process.env.INGESTION_MODE ?? "live";

if (!Number.isFinite(ingestionPollIntervalMs) || ingestionPollIntervalMs <= 0) {
  throw new Error("INGESTION_POLL_INTERVAL_MS must be a positive number");
}

console.log("Starting EZJob worker service...");
console.log("Configured queues:", QUEUE_NAMES);
console.log("Worker concurrency:", concurrency);
console.log("Ingestion poll interval (ms):", ingestionPollIntervalMs);
console.log("Redis URL:", redisUrl);
console.log("Worker instance ID:", instanceId);
console.log("Ingestion mode:", ingestionMode);

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null
});

const bullConnection = {
  url: redisUrl,
  maxRetriesPerRequest: null
} satisfies ConnectionOptions;

const ingestionQueue = new Queue<IngestionJobData>(QUEUE_NAMES.ingestion, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1_000
    },
    removeOnComplete: 50,
    removeOnFail: 100
  }
});

const matchingQueue = new Queue<MatchingJobData>(QUEUE_NAMES.matching, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1_000
    },
    removeOnComplete: 50,
    removeOnFail: 100
  }
});

const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.notification, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1_000
    },
    removeOnComplete: 100,
    removeOnFail: 200
  }
});

const applyQueue = new Queue<ApplyJobData>(QUEUE_NAMES.apply, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1_000
    },
    removeOnComplete: 100,
    removeOnFail: 200
  }
});

const ingestionConnectors =
  ingestionMode === "fixture"
    ? [new FixtureJsonConnector()]
    : [new RemotiveApiConnector(), new WeWorkRemotelyRssConnector()];

const ingestionService = new IngestionService(ingestionConnectors);

const matchingProcessor = new MatchingWorker(notificationQueue);
const applyProcessor = new ApplyWorker();

type IngestionJobData = {
  cycleId: string;
  startedAt: string;
};

type MatchingJobData = {
  cycleId: string;
  startedAt: string;
  ingestionSummary: {
    sourcesProcessed: number;
    fetchedCount: number;
    insertedCount: number;
    exactDuplicateCount: number;
    fuzzyDuplicateCount: number;
    dbDuplicateCount: number;
    errors: number;
  };
};

const ingestionWorker = new Worker<IngestionJobData>(
  QUEUE_NAMES.ingestion,
  async (job) => {
    console.log(`[cycle:${job.data.cycleId}] ingestion phase start`);

    const runs = await ingestionService.runOnce();
    const summary = summarizeRuns(runs);

    console.log(`[cycle:${job.data.cycleId}] ingestion phase end`, summary);

    await matchingQueue.add(
      "run-matching",
      {
        cycleId: job.data.cycleId,
        startedAt: new Date().toISOString(),
        ingestionSummary: summary
      },
      {
        jobId: `matching:${job.data.cycleId}`
      }
    );

    return summary;
  },
  {
    concurrency,
    connection: bullConnection
  }
);

const matchingWorker = new Worker<MatchingJobData>(
  QUEUE_NAMES.matching,
  async (job) => {
    console.log(`[cycle:${job.data.cycleId}] matching phase start`);

    const matchingSummary = await matchingProcessor.runCycle();
    const summary = {
      ...job.data.ingestionSummary,
      ...matchingSummary
    };

    console.log(`[cycle:${job.data.cycleId}] matching phase end`, summary);
    return summary;
  },
  {
    concurrency,
    connection: bullConnection
  }
);

const applyWorker = new Worker<ApplyJobData>(
  QUEUE_NAMES.apply,
  async (job) => applyProcessor.process(job),
  {
    concurrency,
    connection: bullConnection
  }
);

ingestionWorker.on("failed", (job, error) => {
  console.error(`[cycle:${job?.data.cycleId ?? "unknown"}] ingestion phase failed`, error);
});

matchingWorker.on("failed", (job, error) => {
  console.error(`[cycle:${job?.data.cycleId ?? "unknown"}] matching phase failed`, error);
});

applyWorker.on("failed", (job, error) => {
  console.error(`[apply:${job?.data.applicationAttemptId ?? "unknown"}] apply phase failed`, error);
});

const scheduleOptions: JobsOptions = {
  removeOnComplete: true,
  removeOnFail: 100,
  attempts: 1
};

const scheduleCycle = async (): Promise<void> => {
  const cycleId = new Date().toISOString();
  const lockTtlMs = Math.max(ingestionPollIntervalMs - 1_000, 5_000);

  const lockAcquired = await redis.set(
    orchestratorLockKey,
    instanceId,
    "PX",
    lockTtlMs,
    "NX"
  );

  if (lockAcquired !== "OK") {
    return;
  }

  console.log(`[cycle:${cycleId}] schedule start (lock acquired by ${instanceId})`);

  await ingestionQueue.add(
    "run-ingestion",
    {
      cycleId,
      startedAt: new Date().toISOString()
    },
    {
      ...scheduleOptions,
      jobId: `ingestion:${cycleId}`
    }
  );

  console.log(`[cycle:${cycleId}] schedule end (ingestion queued)`);
};

await scheduleCycle();
const schedulerTimer = setInterval(() => {
  void scheduleCycle().catch((error: unknown) => {
    console.error("Failed to schedule cycle", error);
  });
}, ingestionPollIntervalMs);

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}; shutting down worker service...`);
  clearInterval(schedulerTimer);
  await Promise.all([
    ingestionWorker.close(),
    matchingWorker.close(),
    applyWorker.close(),
    ingestionQueue.close(),
    matchingQueue.close(),
    notificationQueue.close(),
    applyQueue.close(),
    matchingProcessor.close(),
    applyProcessor.close(),
    redis.quit(),
  ]);
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

function summarizeRuns(runs: IngestionRunMetadata[]) {
  return runs.reduce(
    (accumulator, run) => {
      accumulator.sourcesProcessed += 1;
      accumulator.fetchedCount += run.fetchedCount;
      accumulator.insertedCount += run.insertedCount;
      accumulator.exactDuplicateCount += run.exactDuplicateCount;
      accumulator.fuzzyDuplicateCount += run.fuzzyDuplicateCount;
      accumulator.dbDuplicateCount += run.dbDuplicateCount;
      accumulator.errors += run.errors.length;
      return accumulator;
    },
    {
      sourcesProcessed: 0,
      fetchedCount: 0,
      insertedCount: 0,
      exactDuplicateCount: 0,
      fuzzyDuplicateCount: 0,
      dbDuplicateCount: 0,
      errors: 0
    }
  );
}
