import "dotenv/config";
import { QUEUE_NAMES } from "@ezjob/common";
import { RemotiveApiConnector } from "./ingestion/connectors/remotive-api.connector.js";
import { WeWorkRemotelyRssConnector } from "./ingestion/connectors/weworkremotely-rss.connector.js";
import { IngestionService } from "./ingestion/service.js";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

console.log("Starting EZJob worker service...");
console.log("Configured queues:", QUEUE_NAMES);
console.log("Worker concurrency:", concurrency);

const ingestionService = new IngestionService([
  new RemotiveApiConnector(),
  new WeWorkRemotelyRssConnector()
]);

const runs = await ingestionService.runOnce();
console.log("Ingestion completed", runs);
