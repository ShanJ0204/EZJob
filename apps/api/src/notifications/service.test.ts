import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../lib/prisma.js";
import { NotificationService } from "./service.js";

test("captureCallback deduplicates repeated Telegram callback deliveries", async () => {
  const original = {
    matchResultFindUnique: prisma.matchResult.findUnique,
    notificationEventFindFirst: prisma.notificationEvent.findFirst,
    applicationAttemptCreate: prisma.applicationAttempt.create,
    notificationEventCreate: prisma.notificationEvent.create,
  };

  let applicationAttemptCreateCalls = 0;
  let queuePublishCalls = 0;

  (prisma.matchResult.findUnique as unknown as (...args: unknown[]) => Promise<unknown>) = async () => ({
    id: "match-1",
    userId: "user-1",
    jobPostingId: "job-1",
    resumeVariantId: "resume-1",
  });

  (prisma.notificationEvent.findFirst as unknown as (...args: unknown[]) => Promise<unknown>) = async () => ({
    id: "event-1"
  });

  (prisma.applicationAttempt.create as unknown as (...args: unknown[]) => Promise<unknown>) = async () => {
    applicationAttemptCreateCalls += 1;
    return { id: "attempt-1" };
  };

  (prisma.notificationEvent.create as unknown as (...args: unknown[]) => Promise<unknown>) = async () => ({
    id: "notification-1"
  });

  const service = new NotificationService(
    { sendMessage: async () => ({ messageId: "msg-1", channel: "bot" }) },
    {
      async publishApply() {
        queuePublishCalls += 1;
      },
      async close() {
        return;
      }
    }
  );

  try {
    const result = await service.captureCallback({
      userId: "user-1",
      matchResultId: "match-1",
      messageId: "message-1",
      action: "Approve",
      metadata: {
        telegramCallbackId: "callback-1"
      },
      correlationId: "corr-1"
    });

    assert.deepEqual(result, { status: "duplicate" });
    assert.equal(applicationAttemptCreateCalls, 0);
    assert.equal(queuePublishCalls, 0);
  } finally {
    prisma.matchResult.findUnique = original.matchResultFindUnique;
    prisma.notificationEvent.findFirst = original.notificationEventFindFirst;
    prisma.applicationAttempt.create = original.applicationAttemptCreate;
    prisma.notificationEvent.create = original.notificationEventCreate;
  }
});
