import { FastifyInstance } from "fastify";

import { TelegramNotificationBot } from "./bot.js";
import { NotificationService } from "./service.js";
import { CallbackPayload, MatchAlertPayload, NOTIFICATION_ACTIONS, NotificationAction } from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseSendBody = (body: unknown): MatchAlertPayload => {
  if (!isObject(body) || typeof body.userId !== "string" || typeof body.matchResultId !== "string") {
    throw new Error("Invalid body. userId and matchResultId are required.");
  }

  return {
    userId: body.userId,
    matchResultId: body.matchResultId,
  };
};

const isNotificationAction = (value: string): value is NotificationAction =>
  (NOTIFICATION_ACTIONS as readonly string[]).includes(value);

const parseCallbackBody = (body: unknown): CallbackPayload => {
  if (
    !isObject(body) ||
    typeof body.userId !== "string" ||
    typeof body.matchResultId !== "string" ||
    typeof body.messageId !== "string" ||
    typeof body.action !== "string" ||
    !isNotificationAction(body.action)
  ) {
    throw new Error("Invalid callback body.");
  }

  return {
    userId: body.userId,
    matchResultId: body.matchResultId,
    messageId: body.messageId,
    action: body.action,
    metadata: isObject(body.metadata) ? body.metadata : undefined,
  };
};

export const registerNotificationRoutes = (app: FastifyInstance, service: NotificationService): void => {
  app.post("/notifications/match-alerts/send", async (request, reply) => {
    try {
      const payload = parseSendBody(request.body);
      const result = await service.sendMatchAlert({
        ...payload,
        correlationId: request.id,
      });
      return reply.code(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, "failed to send match alert");
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Invalid request",
      });
    }
  });

  app.post("/notifications/callbacks", async (request, reply) => {
    try {
      const payload = parseCallbackBody(request.body);
      const result = await service.captureCallback({
        ...payload,
        correlationId: request.id,
      });
      return reply.code(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, "failed to process callback");
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Invalid request",
      });
    }
  });

  app.post("/notifications/telegram/webhook", async (request, reply) => {
    try {
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
      const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (webhookSecret) {
        const headerSecret = request.headers["x-telegram-bot-api-secret-token"];
        const providedSecret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
        if (providedSecret !== webhookSecret) {
          return reply.code(403).send({ status: "forbidden" });
        }
      }

=======
>>>>>>> main
      const body = request.body;
      if (!isObject(body) || !isObject(body.callback_query)) {
        return reply.code(200).send({ status: "ignored" });
      }

      const callbackQuery = body.callback_query;
      const callbackData =
        typeof callbackQuery.data === "string"
          ? TelegramNotificationBot.parseCallbackData(callbackQuery.data)
          : undefined;

      if (!callbackData || !isNotificationAction(callbackData.action)) {
        return reply.code(200).send({ status: "ignored" });
      }

      const payload: CallbackPayload = {
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
=======
        userId: callbackData.userId,
>>>>>>> main
        matchResultId: callbackData.matchResultId,
        messageId: String(
          isObject(callbackQuery.message) && typeof callbackQuery.message.message_id === "number"
            ? callbackQuery.message.message_id
            : callbackQuery.id
        ),
        action: callbackData.action,
        metadata: {
          telegramCallbackId:
            typeof callbackQuery.id === "string" ? callbackQuery.id : undefined
<<<<<<< codex/explore-feasibility-of-job-scraping-bot
        }
=======
        },
        correlationId: request.id,
>>>>>>> main
      };

      const result = await service.captureCallback(payload);
      return reply.code(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, "failed to process telegram webhook callback");
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Invalid telegram webhook request"
      });
    }
  });
};
