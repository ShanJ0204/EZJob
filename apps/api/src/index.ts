import "dotenv/config";
import Fastify from "fastify";
import { QUEUE_NAMES } from "@ezjob/common";

import { ConsoleNotificationBot } from "./notifications/bot.js";
import { registerNotificationRoutes } from "./notifications/routes.js";
import { NotificationService } from "./notifications/service.js";
import { prisma } from "./lib/prisma.js";

const app = Fastify({ logger: true });

const notificationService = new NotificationService(new ConsoleNotificationBot());

app.get("/health", async () => ({ status: "ok" }));

app.get("/queues", async () => ({ queues: QUEUE_NAMES }));

registerNotificationRoutes(app, notificationService);

const port = Number(process.env.API_PORT ?? 8000);
const host = process.env.API_HOST ?? "0.0.0.0";

const closePrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};

app.addHook("onClose", closePrisma);

app.listen({ port, host }).catch((error) => {
  app.log.error(error, "failed to start api");
  process.exit(1);
});
