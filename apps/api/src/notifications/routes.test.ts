import test from "node:test";
import assert from "node:assert/strict";

import Fastify from "fastify";

import { TelegramNotificationBot } from "./bot.js";
import { registerNotificationRoutes } from "./routes.js";
import type { NotificationService } from "./service.js";

<<<<<<< codex/explore-feasibility-of-job-scraping-bot
test("telegram webhook captures callback when secret and payload are valid", async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-secret";
  process.env.TELEGRAM_CALLBACK_SECRET = "callback-secret";

=======
test("telegram webhook captures callback payload", async () => {
>>>>>>> main
  let captured: unknown;
  const service = {
    async sendMatchAlert() {
      return { status: "ok" };
    },
    async captureCallback(payload: unknown) {
      captured = payload;
      return { status: "captured" };
    }
  } as unknown as NotificationService;

  const app = Fastify();
  registerNotificationRoutes(app, service);

<<<<<<< codex/explore-feasibility-of-job-scraping-bot
  const bot = new TelegramNotificationBot("token-123", "chat-1", undefined, "callback-secret");
  const callbackData = bot.buildCallbackData({
=======
  const bot = new TelegramNotificationBot("token-123", "chat-1");
  const callbackData = bot.buildCallbackData({
    userId: "user-1",
>>>>>>> main
    matchResultId: "f2f0fca8-77e9-49f9-9825-c986f4ca1f73",
    action: "Reject"
  });

  const response = await app.inject({
    method: "POST",
    url: "/notifications/telegram/webhook",
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
    headers: {
      "x-telegram-bot-api-secret-token": "webhook-secret"
    },
=======
>>>>>>> main
    payload: {
      callback_query: {
        id: "abc-123",
        data: callbackData,
        message: {
          message_id: 52
        }
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { status: "captured" });
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
  assert.deepEqual(captured, {
    matchResultId: "f2f0fca8-77e9-49f9-9825-c986f4ca1f73",
    messageId: "52",
    action: "Reject",
    metadata: {
      telegramCallbackId: "abc-123"
    }
  });

  await app.close();
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_CALLBACK_SECRET;
});

test("telegram webhook returns forbidden when webhook secret does not match", async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";

  const service = {
    async sendMatchAlert() {
      return { status: "ok" };
    },
    async captureCallback() {
      return { status: "captured" };
    }
  } as unknown as NotificationService;

  const app = Fastify();
  registerNotificationRoutes(app, service);

  const response = await app.inject({
    method: "POST",
    url: "/notifications/telegram/webhook",
    headers: {
      "x-telegram-bot-api-secret-token": "wrong-secret"
    },
    payload: {
      callback_query: {
        id: "abc-123",
        data: "invalid"
      }
    }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(JSON.parse(response.body), { status: "forbidden" });

  await app.close();
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
=======
  assert.ok(captured && typeof captured === "object");
  const callbackPayload = captured as Record<string, unknown>;
  assert.equal(callbackPayload.userId, "user-1");
  assert.equal(callbackPayload.matchResultId, "f2f0fca8-77e9-49f9-9825-c986f4ca1f73");
  assert.equal(callbackPayload.messageId, "52");
  assert.equal(callbackPayload.action, "Reject");
  assert.deepEqual(callbackPayload.metadata, { telegramCallbackId: "abc-123" });
  assert.equal(typeof callbackPayload.correlationId, "string");

  await app.close();
>>>>>>> main
});
