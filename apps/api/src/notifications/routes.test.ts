import test from "node:test";
import assert from "node:assert/strict";

import Fastify from "fastify";

import { TelegramNotificationBot } from "./bot.js";
import { registerNotificationRoutes } from "./routes.js";
import type { NotificationService } from "./service.js";

test("telegram webhook captures callback payload", async () => {
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

  const bot = new TelegramNotificationBot("token-123", "chat-1");
  const callbackData = bot.buildCallbackData({
    userId: "user-1",
    matchResultId: "f2f0fca8-77e9-49f9-9825-c986f4ca1f73",
    action: "Reject"
  });

  const response = await app.inject({
    method: "POST",
    url: "/notifications/telegram/webhook",
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
  assert.ok(captured && typeof captured === "object");
  const callbackPayload = captured as Record<string, unknown>;
  assert.equal(callbackPayload.userId, "user-1");
  assert.equal(callbackPayload.matchResultId, "f2f0fca8-77e9-49f9-9825-c986f4ca1f73");
  assert.equal(callbackPayload.messageId, "52");
  assert.equal(callbackPayload.action, "Reject");
  assert.deepEqual(callbackPayload.metadata, { telegramCallbackId: "abc-123" });
  assert.equal(typeof callbackPayload.correlationId, "string");

  await app.close();
});
