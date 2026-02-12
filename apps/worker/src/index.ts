import "dotenv/config";
import { QUEUE_NAMES } from "@ezjob/common";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

console.log("Starting EZJob worker service...");
console.log("Configured queues:", QUEUE_NAMES);
console.log("Worker concurrency:", concurrency);

console.log("TODO: attach queue consumers for ingestion/matching/apply.");
