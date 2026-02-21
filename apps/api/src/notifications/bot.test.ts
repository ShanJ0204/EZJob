import test from "node:test";
import assert from "node:assert/strict";

import { TelegramNotificationBot } from "./bot.js";

test("Telegram callback data round-trips with signature validation", () => {
  const bot = new TelegramNotificationBot("token-123", "chat-1", undefined, "secret-1");

  const callbackData = bot.buildCallbackData({
    matchResultId: "f2f0fca8-77e9-49f9-9825-c986f4ca1f73",
    action: "Approve"
  });

  const parsed = TelegramNotificationBot.parseCallbackData(callbackData, "secret-1");
  assert.deepEqual(parsed, {
    matchResultId: "f2f0fca8-77e9-49f9-9825-c986f4ca1f73",
    action: "Approve"
  });
});

test("Telegram callback data fails when signature is tampered", () => {
  const bot = new TelegramNotificationBot("token-123", "chat-1", undefined, "secret-1");

  const callbackData = bot.buildCallbackData({
    matchResultId: "f2f0fca8-77e9-49f9-9825-c986f4ca1f73",
    action: "Approve"
  });

  const tampered = `${callbackData.slice(0, -1)}0`;
  const parsed = TelegramNotificationBot.parseCallbackData(tampered, "secret-1");
  assert.equal(parsed, undefined);
});
