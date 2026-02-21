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
      correlationId: input.correlationId,
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

const TELEGRAM_SEND_MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 300;

const getRetryDelayMs = (response: Response, attempt: number): number => {
  const retryAfterHeader = response.headers.get("retry-after");
  if (retryAfterHeader) {
    const asNumber = Number(retryAfterHeader);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber * 1000;
    }
  }

  return BASE_BACKOFF_MS * (2 ** Math.max(0, attempt - 1));
};

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

export class TelegramNotificationBot implements NotificationBot {
  private readonly token: string;

  private readonly defaultChatId?: string;

  private readonly chatIdByUser: Record<string, string>;

  public constructor(
    token = process.env.TELEGRAM_BOT_TOKEN,
    defaultChatId = process.env.TELEGRAM_CHAT_ID_DEFAULT,
    chatIdMapRaw = process.env.TELEGRAM_CHAT_ID_MAP
  ) {
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is required for TelegramNotificationBot");
    }

    this.token = token;
    this.defaultChatId = defaultChatId;
    this.chatIdByUser = parseChatIdMap(chatIdMapRaw);
  }

  public buildCallbackData(input: { userId: string; matchResultId: string; action: string }): string {
    return ["ezjob", input.userId, input.matchResultId, input.action].join("|");
  }

  public static parseCallbackData(data: string):
    | { userId: string; matchResultId: string; action: string }
    | undefined {
    const segments = data.split("|");
    if (segments.length !== 4 || segments[0] !== "ezjob") {
      return undefined;
    }

    return {
      userId: segments[1],
      matchResultId: segments[2],
      action: segments[3]
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
          userId: input.userId,
          matchResultId: input.matchResultId,
          action
        })
      }
    ]);

    for (let attempt = 1; attempt <= TELEGRAM_SEND_MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
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
      } catch (error) {
        console.error("[notification-bot] telegram sendMessage network failure", {
          correlationId: input.correlationId,
          provider: "telegram",
          operation: "sendMessage",
          userId: input.userId,
          matchResultId: input.matchResultId,
          attempt,
          maxAttempts: TELEGRAM_SEND_MAX_ATTEMPTS,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt >= TELEGRAM_SEND_MAX_ATTEMPTS) {
          throw error;
        }

        await sleep(BASE_BACKOFF_MS * (2 ** (attempt - 1)));
        continue;
      }

      if (!response.ok) {
        const responseText = await response.text();
        console.error("[notification-bot] telegram sendMessage http failure", {
          correlationId: input.correlationId,
          provider: "telegram",
          operation: "sendMessage",
          userId: input.userId,
          matchResultId: input.matchResultId,
          attempt,
          maxAttempts: TELEGRAM_SEND_MAX_ATTEMPTS,
          statusCode: response.status,
          responseBody: responseText,
        });

        if (attempt < TELEGRAM_SEND_MAX_ATTEMPTS && isRetryableStatus(response.status)) {
          await sleep(getRetryDelayMs(response, attempt));
          continue;
        }

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

    throw new Error("Telegram sendMessage failed after retries");
  }
}
