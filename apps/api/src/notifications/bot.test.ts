import test from "node:test";
import assert from "node:assert/strict";

import { TelegramNotificationBot } from "./bot.js";

test("Telegram callback data round-trips", () => {
  const bot = new TelegramNotificationBot("token-123", "chat-1");

  const callbackData = bot.buildCallbackData({
    userId: "user-1",
    matchResultId: "f2f0fca8-77e9-49f9-9825-c986f4ca1f73",
    action: "Approve"
  });

  const parsed = TelegramNotificationBot.parseCallbackData(callbackData);
  assert.deepEqual(parsed, {
    userId: "user-1",
    matchResultId: "f2f0fca8-77e9-49f9-9825-c986f4ca1f73",
    action: "Approve"
  });
});

test("Telegram sendMessage retries on 429 and eventually succeeds", async () => {
  const bot = new TelegramNotificationBot("token-123", "chat-1");
  const originalFetch = global.fetch;

  let calls = 0;
  global.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("rate limited", {
        status: 429,
        headers: {
          "retry-after": "0"
        }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      result: { message_id: 777 }
    }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  }) as typeof fetch;

  try {
    const result = await bot.sendMessage({
      userId: "user-1",
      matchResultId: "match-1",
      text: "hello",
      actions: ["Review"],
      correlationId: "corr-1"
    });

    assert.equal(calls, 2);
    assert.equal(result.messageId, "777");
  } finally {
    global.fetch = originalFetch;
  }
});
