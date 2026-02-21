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

type TelegramInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

type TelegramSendMessageResponse = {
  ok: boolean;
  result?: {
    message_id: number;
  };
  description?: string;
};

const ACTION_TO_CODE = {
  Review: "R",
  "Generate Docs": "G",
  Approve: "A",
  Reject: "X"
} as const;

const CODE_TO_ACTION = {
  R: "Review",
  G: "Generate Docs",
  A: "Approve",
  X: "Reject"
} as const;

const signCallbackPayload = (secret: string, payload: string): string =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);

const parseChatIdMap = (raw: string | undefined): Record<string, string> => {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
};

export class TelegramNotificationBot implements NotificationBot {
  private readonly token: string;

  private readonly defaultChatId?: string;

  private readonly chatIdByUser: Record<string, string>;

  private readonly callbackSecret: string;

  public constructor(
    token = process.env.TELEGRAM_BOT_TOKEN,
    defaultChatId = process.env.TELEGRAM_CHAT_ID_DEFAULT,
    chatIdMapRaw = process.env.TELEGRAM_CHAT_ID_MAP,
    callbackSecret = process.env.TELEGRAM_CALLBACK_SECRET
  ) {
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is required for TelegramNotificationBot");
    }

    this.token = token;
    this.defaultChatId = defaultChatId;
    this.chatIdByUser = parseChatIdMap(chatIdMapRaw);
    this.callbackSecret = callbackSecret ?? token;
  }

  public buildCallbackData(input: { matchResultId: string; action: string }): string {
    const actionCode = ACTION_TO_CODE[input.action as keyof typeof ACTION_TO_CODE];
    if (!actionCode) {
      throw new Error(`Unsupported Telegram notification action: ${input.action}`);
    }

    const unsigned = `e1|${input.matchResultId}|${actionCode}`;
    const signature = signCallbackPayload(this.callbackSecret, unsigned);
    return `${unsigned}|${signature}`;
  }

  public static parseCallbackData(
    data: string,
    callbackSecret = process.env.TELEGRAM_CALLBACK_SECRET ?? process.env.TELEGRAM_BOT_TOKEN
  ):
    | { matchResultId: string; action: string }
    | undefined {
    const segments = data.split("|");
    if (segments.length !== 4 || segments[0] !== "e1") {
      return undefined;
    }

    const [version, matchResultId, actionCode, signature] = segments;
    if (!callbackSecret || !matchResultId || !actionCode || !signature) {
      return undefined;
    }

    const unsigned = `${version}|${matchResultId}|${actionCode}`;
    const expectedSignature = signCallbackPayload(callbackSecret, unsigned);
    if (expectedSignature !== signature) {
      return undefined;
    }

    const action = CODE_TO_ACTION[actionCode as keyof typeof CODE_TO_ACTION];
    if (!action) {
      return undefined;
    }

    return {
      matchResultId,
      action
    };
  }

  public async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const chatId = this.chatIdByUser[input.userId] ?? this.defaultChatId;
    if (!chatId) {
      throw new Error(
        `No Telegram chat id configured for user ${input.userId}. Set TELEGRAM_CHAT_ID_DEFAULT or TELEGRAM_CHAT_ID_MAP.`
      );
    }

    const inlineKeyboard: TelegramInlineKeyboardButton[][] = input.actions.map((action) => [
      {
        text: action,
        callback_data: this.buildCallbackData({
          matchResultId: input.matchResultId,
          action
        })
      }
    ]);

    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: input.text,
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as TelegramSendMessageResponse;
    if (!payload.ok || !payload.result?.message_id) {
      throw new Error(payload.description ?? "Telegram sendMessage returned unexpected response");
    }

    return {
      messageId: String(payload.result.message_id),
      channel: "telegram",
      rawResponse: {
        chatId,
        messageId: payload.result.message_id
      }
    };
  }
}
