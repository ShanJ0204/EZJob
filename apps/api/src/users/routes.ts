import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";

type UserParams = {
  userId: string;
};

type UserMatchesQuerystring = {
  decision?: string;
  limit?: string;
};

type UserPreferenceRecord = Awaited<ReturnType<PrismaClient["userPreference"]["findUnique"]>>;
type CandidateProfileRecord = Awaited<ReturnType<PrismaClient["candidateProfile"]["findUnique"]>>;

type ParsedPreferencesPayload = {
  desiredTitles?: string[];
  preferredLocations?: string[];
  remoteOnly?: boolean;
  minSalary?: number | null;
  maxSalary?: number | null;
  employmentTypes?: string[];
  notificationsEnabled?: boolean;
  maxNotificationsPerHour?: number;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  timeZone?: string;
};

type ParsedProfilePayload = {
  fullName?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  yearsExperience?: number | null;
  summary?: string | null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeStringArray = (value: unknown, fieldName: string): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }

  const normalized = value.map((entry) => {
    if (typeof entry !== "string") {
      throw new Error(`${fieldName} must be an array of strings.`);
    }

    const trimmed = entry.trim();
    if (!trimmed) {
      throw new Error(`${fieldName} entries must be non-empty strings.`);
    }

    return trimmed;
  });

  return Array.from(new Set(normalized));
};

const normalizeOptionalString = (value: unknown, fieldName: string): string | null => {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseOwnership = (request: FastifyRequest<{ Params: UserParams }>): boolean => {
  const actingUserId = request.headers["x-user-id"];
  return typeof actingUserId === "string" && actingUserId === request.params.userId;
};

const assertTimeZone = (value: string): void => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
  } catch {
    throw new Error("timeZone must be a valid IANA timezone.");
  }
};

const parsePreferencesPayload = (body: unknown): ParsedPreferencesPayload => {
  if (!isObject(body)) {
    throw new Error("Invalid preferences payload.");
  }

  const payload: ParsedPreferencesPayload = {};

  if ("desiredTitles" in body) {
    payload.desiredTitles = normalizeStringArray(body.desiredTitles, "desiredTitles");
  }

  if ("preferredLocations" in body) {
    payload.preferredLocations = normalizeStringArray(body.preferredLocations, "preferredLocations");
  }

  if ("employmentTypes" in body) {
    payload.employmentTypes = normalizeStringArray(body.employmentTypes, "employmentTypes");
  }

  if ("remoteOnly" in body) {
    if (typeof body.remoteOnly !== "boolean") {
      throw new Error("remoteOnly must be a boolean.");
    }
    payload.remoteOnly = body.remoteOnly;
  }

  if ("minSalary" in body) {
    const minSalary = body.minSalary;
    if (minSalary !== null && (typeof minSalary !== "number" || !Number.isInteger(minSalary) || minSalary < 0)) {
      throw new Error("minSalary must be a non-negative integer or null.");
    }
    payload.minSalary = minSalary;
  }

  if ("maxSalary" in body) {
    const maxSalary = body.maxSalary;
    if (maxSalary !== null && (typeof maxSalary !== "number" || !Number.isInteger(maxSalary) || maxSalary < 0)) {
      throw new Error("maxSalary must be a non-negative integer or null.");
    }
    payload.maxSalary = maxSalary;
  }

  const minSalary = payload.minSalary;
  const maxSalary = payload.maxSalary;
  if (typeof minSalary === "number" && typeof maxSalary === "number" && minSalary > maxSalary) {
    throw new Error("minSalary cannot be greater than maxSalary.");
  }

  if ("notificationsEnabled" in body) {
    if (typeof body.notificationsEnabled !== "boolean") {
      throw new Error("notificationsEnabled must be a boolean.");
    }
    payload.notificationsEnabled = body.notificationsEnabled;
  }

  if ("maxNotificationsPerHour" in body) {
    const maxNotificationsPerHour = body.maxNotificationsPerHour;
    if (
      typeof maxNotificationsPerHour !== "number" ||
      !Number.isInteger(maxNotificationsPerHour) ||
      maxNotificationsPerHour < 1 ||
      maxNotificationsPerHour > 60
    ) {
      throw new Error("maxNotificationsPerHour must be an integer between 1 and 60.");
    }
    payload.maxNotificationsPerHour = maxNotificationsPerHour;
  }

  if ("quietHoursStart" in body) {
    const quietHoursStart = body.quietHoursStart;
    if (
      quietHoursStart !== null &&
      (typeof quietHoursStart !== "number" || !Number.isInteger(quietHoursStart) || quietHoursStart < 0 || quietHoursStart > 23)
    ) {
      throw new Error("quietHoursStart must be an integer between 0 and 23 or null.");
    }
    payload.quietHoursStart = quietHoursStart;
  }

  if ("quietHoursEnd" in body) {
    const quietHoursEnd = body.quietHoursEnd;
    if (
      quietHoursEnd !== null &&
      (typeof quietHoursEnd !== "number" || !Number.isInteger(quietHoursEnd) || quietHoursEnd < 0 || quietHoursEnd > 23)
    ) {
      throw new Error("quietHoursEnd must be an integer between 0 and 23 or null.");
    }
    payload.quietHoursEnd = quietHoursEnd;
  }

  if ("timeZone" in body) {
    if (typeof body.timeZone !== "string" || body.timeZone.trim().length === 0) {
      throw new Error("timeZone must be a non-empty string.");
    }

    const normalized = body.timeZone.trim();
    assertTimeZone(normalized);
    payload.timeZone = normalized;
  }

  return payload;
};

const parseProfilePayload = (body: unknown): ParsedProfilePayload => {
  if (!isObject(body)) {
    throw new Error("Invalid profile payload.");
  }

  const payload: ParsedProfilePayload = {};

  if ("fullName" in body) {
    payload.fullName = normalizeOptionalString(body.fullName, "fullName");
  }

  if ("phone" in body) {
    payload.phone = normalizeOptionalString(body.phone, "phone");
  }

  if ("linkedinUrl" in body) {
    const normalized = normalizeOptionalString(body.linkedinUrl, "linkedinUrl");
    if (normalized) {
      try {
        new URL(normalized);
      } catch {
        throw new Error("linkedinUrl must be a valid URL.");
      }
    }
    payload.linkedinUrl = normalized;
  }

  if ("githubUrl" in body) {
    const normalized = normalizeOptionalString(body.githubUrl, "githubUrl");
    if (normalized) {
      try {
        new URL(normalized);
      } catch {
        throw new Error("githubUrl must be a valid URL.");
      }
    }
    payload.githubUrl = normalized;
  }

  if ("yearsExperience" in body) {
    if (
      body.yearsExperience !== null &&
      (typeof body.yearsExperience !== "number" || body.yearsExperience < 0 || body.yearsExperience > 80)
    ) {
      throw new Error("yearsExperience must be a number between 0 and 80, or null.");
    }

    payload.yearsExperience =
      typeof body.yearsExperience === "number" ? Number(body.yearsExperience.toFixed(1)) : null;
  }

  if ("summary" in body) {
    payload.summary = normalizeOptionalString(body.summary, "summary");
  }

  return payload;
};

const mapPreferencesResponse = (userId: string, preferences: UserPreferenceRecord) => ({
  userId,
  desiredTitles: preferences?.desiredTitles ?? [],
  preferredLocations: preferences?.preferredLocations ?? [],
  remoteOnly: preferences?.remoteOnly ?? false,
  minSalary: preferences?.minSalary ?? null,
  maxSalary: preferences?.maxSalary ?? null,
  employmentTypes: preferences?.employmentTypes ?? [],
  notificationSettings: {
    enabled: preferences?.notificationsEnabled ?? true,
    maxNotificationsPerHour: preferences?.maxNotificationsPerHour ?? 3,
    quietHoursStart: preferences?.quietHoursStart ?? null,
    quietHoursEnd: preferences?.quietHoursEnd ?? null,
    timeZone: preferences?.timeZone ?? "UTC"
  },
  matchingInput: {
    desiredTitles: preferences?.desiredTitles ?? [],
    preferredLocations: preferences?.preferredLocations ?? [],
    remoteOnly: preferences?.remoteOnly ?? false,
    minSalary: preferences?.minSalary ?? null
  }
});

const mapProfileResponse = (userId: string, profile: CandidateProfileRecord) => ({
  userId,
  fullName: profile?.fullName ?? null,
  phone: profile?.phone ?? null,
  links: {
    linkedinUrl: profile?.linkedinUrl ?? null,
    githubUrl: profile?.githubUrl ?? null
  },
  yearsExperience: profile?.yearsExperience ? Number(profile.yearsExperience) : null,
  summary: profile?.summary ?? null,
  matchingInput: {
    skills: [],
    acceptedSeniority: []
  }
});

const forbidden = (reply: FastifyReply) =>
  reply.code(403).send({ error: "Forbidden: cannot mutate another user's data." });

const parseLimit = (value: string | undefined): number => {
  if (value === undefined) {
    return 25;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("limit must be an integer between 1 and 100.");
  }

  return parsed;
};

export const registerUserSetupRoutes = (app: FastifyInstance, db: PrismaClient): void => {
  app.get<{ Params: UserParams; Querystring: UserMatchesQuerystring }>("/users/:userId/matches", async (request, reply) => {
    try {
      const limit = parseLimit(request.query.limit);
      const decision = request.query.decision?.trim();

      const matches = await db.matchResult.findMany({
        where: {
          userId: request.params.userId,
          ...(decision
            ? {
                notificationEvents: {
                  some: {
                    decision
                  }
                }
              }
            : {})
        },
        orderBy: {
          createdAt: "desc"
        },
        take: limit,
        include: {
          notificationEvents: {
            orderBy: {
              createdAt: "desc"
            },
            take: 1
          }
        }
      });

      return reply.code(200).send({
        userId: request.params.userId,
        count: matches.length,
        matches: matches.map((match: (typeof matches)[number]) => ({
          id: match.id,
          jobPostingId: match.jobPostingId,
          score: Number(match.score),
          reasonSummary: match.reasonSummary,
          createdAt: match.createdAt,
          callbackDecision: match.notificationEvents[0]?.decision ?? null
        }))
      });
    } catch (error) {
      request.log.error({ err: error }, "failed to list user matches");
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
  });

  app.get<{ Params: UserParams }>("/users/:userId/notifications", async (request, reply) => {
    const notifications = await db.notificationEvent.findMany({
      where: { userId: request.params.userId },
      orderBy: {
        createdAt: "desc"
      },
      include: {
        matchResult: {
          select: {
            score: true,
            reasonSummary: true
          }
        }
      }
    });

    return reply.code(200).send({
      userId: request.params.userId,
      count: notifications.length,
      notifications: notifications.map((notification: (typeof notifications)[number]) => ({
        id: notification.id,
        matchResultId: notification.matchResultId,
        status: notification.status,
        callbackDecision: notification.decision,
        eventType: notification.eventType,
        sentAt: notification.sentAt,
        createdAt: notification.createdAt,
        score: notification.matchResult ? Number(notification.matchResult.score) : null,
        reasonSummary: notification.matchResult?.reasonSummary ?? null
      }))
    });
  });

  app.get<{ Params: UserParams }>("/users/:userId/applications", async (request, reply) => {
    const applications = await db.applicationAttempt.findMany({
      where: { userId: request.params.userId },
      orderBy: {
        attemptedAt: "desc"
      },
      include: {
        matchResult: {
          select: {
            score: true,
            reasonSummary: true
          }
        }
      }
    });

    return reply.code(200).send({
      userId: request.params.userId,
      count: applications.length,
      applications: applications.map((application: (typeof applications)[number]) => ({
        id: application.id,
        jobPostingId: application.jobPostingId,
        matchResultId: application.matchResultId,
        status: application.status,
        attemptedAt: application.attemptedAt,
        completedAt: application.completedAt,
        score: application.matchResult ? Number(application.matchResult.score) : null,
        reasonSummary: application.matchResult?.reasonSummary ?? null
      }))
    });
  });

  app.get<{ Params: UserParams }>("/users/:userId/funnel", async (request, reply) => {
    const [matched, notified, approved, applied] = await Promise.all([
      db.matchResult.count({
        where: {
          userId: request.params.userId
        }
      }),
      db.notificationEvent.count({
        where: {
          userId: request.params.userId,
          status: "sent"
        }
      }),
      db.notificationEvent.count({
        where: {
          userId: request.params.userId,
          decision: "approve"
        }
      }),
      db.applicationAttempt.count({
        where: {
          userId: request.params.userId,
          status: "applied"
        }
      })
    ]);

    return reply.code(200).send({
      userId: request.params.userId,
      funnel: {
        matched,
        notified,
        approved,
        applied
      }
    });
  });

  app.get<{ Params: UserParams }>("/users/:userId/preferences", async (request, reply) => {
    const preferences = await db.userPreference.findUnique({
      where: { userId: request.params.userId }
    });

    return reply.code(200).send(mapPreferencesResponse(request.params.userId, preferences));
  });

  app.put<{ Params: UserParams }>("/users/:userId/preferences", async (request, reply) => {
    try {
      if (!parseOwnership(request)) {
        return forbidden(reply);
      }

      const payload = parsePreferencesPayload(request.body);
      const preferences = await db.userPreference.upsert({
        where: { userId: request.params.userId },
        create: {
          userId: request.params.userId,
          ...payload
        },
        update: payload
      });

      return reply.code(200).send(mapPreferencesResponse(request.params.userId, preferences));
    } catch (error) {
      request.log.error({ err: error }, "failed to update user preferences");
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
  });

  app.get<{ Params: UserParams }>("/users/:userId/profile", async (request, reply) => {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: request.params.userId }
    });

    return reply.code(200).send(mapProfileResponse(request.params.userId, profile));
  });

  app.put<{ Params: UserParams }>("/users/:userId/profile", async (request, reply) => {
    try {
      if (!parseOwnership(request)) {
        return forbidden(reply);
      }

      const payload = parseProfilePayload(request.body);
      const profile = await db.candidateProfile.upsert({
        where: { userId: request.params.userId },
        create: {
          userId: request.params.userId,
          ...payload
        },
        update: payload
      });

      return reply.code(200).send(mapProfileResponse(request.params.userId, profile));
    } catch (error) {
      request.log.error({ err: error }, "failed to upsert candidate profile");
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
  });
};
