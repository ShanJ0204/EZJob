import "dotenv/config";
import Fastify from "fastify";
import { QUEUE_NAMES } from "@ezjob/common";

import { ConsoleNotificationBot, TelegramNotificationBot } from "./notifications/bot.js";
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
=======
import { BullApplyQueuePublisher } from "./notifications/apply-queue.js";
>>>>>>> main
import { registerNotificationRoutes } from "./notifications/routes.js";
import { NotificationService } from "./notifications/service.js";
import { registerUserSetupRoutes } from "./users/routes.js";
import { prisma } from "./lib/prisma.js";

const validateTelegramConfig = (): void => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return;
  }

  const defaultChatId = process.env.TELEGRAM_CHAT_ID_DEFAULT;
  const chatIdMapRaw = process.env.TELEGRAM_CHAT_ID_MAP;

  if (!defaultChatId && !chatIdMapRaw) {
    throw new Error(
      "Telegram mode requires TELEGRAM_CHAT_ID_DEFAULT or TELEGRAM_CHAT_ID_MAP when TELEGRAM_BOT_TOKEN is set."
    );
  }

  if (chatIdMapRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(chatIdMapRaw);
    } catch {
      throw new Error("TELEGRAM_CHAT_ID_MAP must be valid JSON when Telegram mode is enabled.");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("TELEGRAM_CHAT_ID_MAP must be a JSON object of userId to chatId strings.");
    }

    const invalidEntry = Object.entries(parsed).find(
      ([userId, chatId]) => typeof userId !== "string" || typeof chatId !== "string"
    );

    if (invalidEntry) {
      throw new Error("TELEGRAM_CHAT_ID_MAP must only include string userId and string chatId values.");
    }
  }
};

validateTelegramConfig();

const app = Fastify({ logger: true });

const notificationBot = process.env.TELEGRAM_BOT_TOKEN
  ? new TelegramNotificationBot()
  : new ConsoleNotificationBot();
<<<<<<< codex/explore-feasibility-of-job-scraping-bot

const notificationService = new NotificationService(notificationBot);
=======
const applyQueuePublisher = new BullApplyQueuePublisher();

const notificationService = new NotificationService(notificationBot, applyQueuePublisher);
>>>>>>> main

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
