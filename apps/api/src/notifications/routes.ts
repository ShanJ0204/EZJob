import { FastifyInstance } from "fastify";

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
      const result = await service.sendMatchAlert(payload);
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
      const result = await service.captureCallback(payload);
      return reply.code(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, "failed to process callback");
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Invalid request",
      });
    }
  });
};
