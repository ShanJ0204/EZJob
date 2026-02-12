import crypto from "node:crypto";

import { SendMessageInput, SendMessageResult } from "./types.js";

export interface NotificationBot {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}

export class ConsoleNotificationBot implements NotificationBot {
  public async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const messageId = crypto.randomUUID();

    console.info("[notification-bot] sending match alert", {
      userId: input.userId,
      matchResultId: input.matchResultId,
      actions: input.actions,
      messagePreview: input.text,
      messageId,
    });

    return {
      messageId,
      channel: "bot",
      rawResponse: {
        accepted: true,
      },
    };
  }
}
