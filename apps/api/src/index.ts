import "dotenv/config";
import Fastify from "fastify";
import { QUEUE_NAMES } from "@ezjob/common";

import { ConsoleNotificationBot, TelegramNotificationBot } from "./notifications/bot.js";
import { BullApplyQueuePublisher } from "./notifications/apply-queue.js";
import { registerNotificationRoutes } from "./notifications/routes.js";
import { NotificationService } from "./notifications/service.js";
import { registerUserSetupRoutes } from "./users/routes.js";
import { prisma } from "./lib/prisma.js";

const app = Fastify({ logger: true });

const notificationBot = process.env.TELEGRAM_BOT_TOKEN
  ? new TelegramNotificationBot()
  : new ConsoleNotificationBot();
const applyQueuePublisher = new BullApplyQueuePublisher();

const notificationService = new NotificationService(notificationBot, applyQueuePublisher);

app.get("/health", async () => ({ status: "ok" }));

app.get("/queues", async () => ({ queues: QUEUE_NAMES }));

registerNotificationRoutes(app, notificationService);
registerUserSetupRoutes(app, prisma);

const port = Number(process.env.API_PORT ?? 8000);
const host = process.env.API_HOST ?? "0.0.0.0";

const closePrisma = async (): Promise<void> => {
  await Promise.all([
    prisma.$disconnect(),
    applyQueuePublisher.close(),
  ]);
};

app.addHook("onClose", closePrisma);

app.listen({ port, host }).catch((error) => {
  app.log.error(error, "failed to start api");
  process.exit(1);
});
