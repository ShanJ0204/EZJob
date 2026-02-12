import { Prisma, UserPreference } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { NotificationBot } from "./bot.js";
import { buildMatchAlertMessage } from "./template.js";
import { CallbackPayload, MatchAlertPayload, NOTIFICATION_ACTIONS, NotificationAction } from "./types.js";

const QUIET_HOURS_BLOCK_STATUS = "quiet_hours";
const RATE_LIMIT_BLOCK_STATUS = "rate_limited";
const DELIVERY_SUCCESS_STATUS = "sent";
const CALLBACK_STATUS = "received";
const DECISION_CAPTURED_STATUS = "captured";

const SEND_EVENT_TYPE = "match_alert.send";
const CALLBACK_EVENT_TYPE = "match_alert.callback";
const DECISION_EVENT_TYPE = "match_alert.decision";

const mapReasonDetails = (reasonDetails: Prisma.JsonValue | null): string[] => {
  if (!Array.isArray(reasonDetails)) {
    return [];
  }

  return reasonDetails.filter((item): item is string => typeof item === "string");
};

const getHourInTimeZone = (timeZone: string, date: Date): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(date);

  const hourPart = parts.find((part) => part.type === "hour")?.value;

  return Number(hourPart ?? "0");
};



const asJsonObject = (value: Record<string, unknown>): Prisma.InputJsonObject =>
  value as Prisma.InputJsonObject;

const isWithinQuietHours = (preference: UserPreference, now: Date): boolean => {
  if (preference.quietHoursStart === null || preference.quietHoursEnd === null) {
    return false;
  }

  const hour = getHourInTimeZone(preference.timeZone, now);

  if (preference.quietHoursStart === preference.quietHoursEnd) {
    return true;
  }

  if (preference.quietHoursStart < preference.quietHoursEnd) {
    return hour >= preference.quietHoursStart && hour < preference.quietHoursEnd;
  }

  return hour >= preference.quietHoursStart || hour < preference.quietHoursEnd;
};

export class NotificationService {
  public constructor(private readonly bot: NotificationBot) {}

  public async sendMatchAlert(payload: MatchAlertPayload): Promise<{ status: string; messageId?: string }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [matchResult, preference] = await Promise.all([
      prisma.matchResult.findUnique({
        where: { id: payload.matchResultId },
        include: { jobPosting: true },
      }),
      prisma.userPreference.findUnique({
        where: { userId: payload.userId },
      }),
    ]);

    if (!matchResult || matchResult.userId !== payload.userId) {
      throw new Error("Match result not found for user");
    }

    const activePreference =
      preference ??
      (await prisma.userPreference.create({
        data: {
          userId: payload.userId,
        },
      }));

    if (!activePreference.notificationsEnabled) {
      await this.logEvent(payload.userId, payload.matchResultId, SEND_EVENT_TYPE, "suppressed", asJsonObject({
        reason: "notifications_disabled",
      }));
      return { status: "notifications_disabled" };
    }

    if (isWithinQuietHours(activePreference, now)) {
      await this.logEvent(payload.userId, payload.matchResultId, SEND_EVENT_TYPE, QUIET_HOURS_BLOCK_STATUS, asJsonObject({
        quietHoursStart: activePreference.quietHoursStart,
        quietHoursEnd: activePreference.quietHoursEnd,
        timeZone: activePreference.timeZone,
      }));
      return { status: QUIET_HOURS_BLOCK_STATUS };
    }

    const sentInLastHour = await prisma.notificationEvent.count({
      where: {
        userId: payload.userId,
        eventType: SEND_EVENT_TYPE,
        status: DELIVERY_SUCCESS_STATUS,
        createdAt: {
          gte: oneHourAgo,
        },
      },
    });

    if (sentInLastHour >= activePreference.maxNotificationsPerHour) {
      await this.logEvent(payload.userId, payload.matchResultId, SEND_EVENT_TYPE, RATE_LIMIT_BLOCK_STATUS, asJsonObject({
        maxNotificationsPerHour: activePreference.maxNotificationsPerHour,
        sentInLastHour,
      }));
      return { status: RATE_LIMIT_BLOCK_STATUS };
    }

    const reasonDetails = mapReasonDetails(matchResult.reasonDetails);

    const messageText = buildMatchAlertMessage({
      jobTitle: matchResult.jobPosting.title,
      companyName: matchResult.jobPosting.companyName,
      locationText: matchResult.jobPosting.locationText ?? "Location not provided",
      score: matchResult.score.toString(),
      reasonSummary: matchResult.reasonSummary ?? "Strong profile alignment",
      topReasons: reasonDetails,
      actions: NOTIFICATION_ACTIONS,
    });

    const delivery = await this.bot.sendMessage({
      userId: payload.userId,
      matchResultId: payload.matchResultId,
      text: messageText,
      actions: NOTIFICATION_ACTIONS,
    });

    await this.logEvent(payload.userId, payload.matchResultId, SEND_EVENT_TYPE, DELIVERY_SUCCESS_STATUS, asJsonObject({
      messageText,
      actions: [...NOTIFICATION_ACTIONS],
      botResponse: delivery.rawResponse ? asJsonObject(delivery.rawResponse) : null,
    }), delivery.channel, now, delivery.messageId);

    return { status: DELIVERY_SUCCESS_STATUS, messageId: delivery.messageId };
  }

  public async captureCallback(payload: CallbackPayload): Promise<{ status: string }> {
    await this.logEvent(payload.userId, payload.matchResultId, CALLBACK_EVENT_TYPE, CALLBACK_STATUS, asJsonObject({
      action: payload.action,
      metadata: payload.metadata ? asJsonObject(payload.metadata) : null,
    }), "bot", undefined, payload.messageId, payload.action);

    await this.logEvent(payload.userId, payload.matchResultId, DECISION_EVENT_TYPE, DECISION_CAPTURED_STATUS, asJsonObject({
      decision: payload.action,
      messageId: payload.messageId,
      metadata: payload.metadata ? asJsonObject(payload.metadata) : null,
    }), "bot", undefined, payload.messageId, payload.action);

    return { status: DECISION_CAPTURED_STATUS };
  }

  private async logEvent(
    userId: string,
    matchResultId: string,
    eventType: string,
    status: string,
    payload: Prisma.InputJsonValue,
    channel = "bot",
    sentAt?: Date,
    externalMessageId?: string,
    decision?: NotificationAction,
  ): Promise<void> {
    await prisma.notificationEvent.create({
      data: {
        userId,
        matchResultId,
        channel,
        eventType,
        status,
        payload,
        sentAt,
        externalMessageId,
        decision,
      },
    });
  }
}
