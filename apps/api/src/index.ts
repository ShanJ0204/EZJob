import "dotenv/config";
import Fastify from "fastify";
import { QUEUE_NAMES } from "@ezjob/common";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

app.get("/queues", async () => ({ queues: QUEUE_NAMES }));

const port = Number(process.env.API_PORT ?? 8000);
const host = process.env.API_HOST ?? "0.0.0.0";

app.listen({ port, host }).catch((error) => {
  app.log.error(error, "failed to start api");
  process.exit(1);
});
