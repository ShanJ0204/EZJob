import "dotenv/config";
import { QUEUE_NAMES } from "@ezjob/common";
import { RemotiveApiConnector } from "./ingestion/connectors/remotive-api.connector.js";
import { WeWorkRemotelyRssConnector } from "./ingestion/connectors/weworkremotely-rss.connector.js";
import { IngestionService } from "./ingestion/service.js";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
const ingestionPollIntervalMs = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? 30000);

console.log("Starting EZJob worker service...");
console.log("Configured queues:", QUEUE_NAMES);
console.log("Worker concurrency:", concurrency);

const ingestionService = new IngestionService([
  new RemotiveApiConnector(),
  new WeWorkRemotelyRssConnector()
]);

let ingestionInProgress = false;

const runIngestionCycle = async (): Promise<void> => {
  if (ingestionInProgress) {
    console.log("Skipping ingestion cycle: previous run still in progress");
    return;
  }

  ingestionInProgress = true;
  try {
    const runs = await ingestionService.runOnce();
    console.log("Ingestion completed", runs);
  } catch (error) {
    console.error("Ingestion cycle failed", error);
  } finally {
    ingestionInProgress = false;
  }
};

await runIngestionCycle();
setInterval(() => {
  void runIngestionCycle();
}, ingestionPollIntervalMs);
