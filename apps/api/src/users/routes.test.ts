import test from "node:test";
import assert from "node:assert/strict";

import Fastify from "fastify";

import { registerUserSetupRoutes } from "./routes.js";

const createMockPrisma = () => {
  const store: {
    preferencesByUserId: Record<string, Record<string, unknown>>;
    profileByUserId: Record<string, Record<string, unknown>>;
    matchesByUserId: Record<string, Array<Record<string, unknown>>>;
    notificationsByUserId: Record<string, Array<Record<string, unknown>>>;
    applicationsByUserId: Record<string, Array<Record<string, unknown>>>;
  } = {
    preferencesByUserId: {},
    profileByUserId: {},
    matchesByUserId: {
      "u-vis": [
        {
          id: "match-1",
          jobPostingId: "job-1",
          score: 91.2,
          reasonSummary: "Strong backend fit",
          createdAt: "2026-02-12T11:00:00.000Z",
          notificationEvents: [{ decision: "approve", createdAt: "2026-02-12T11:05:00.000Z" }]
        },
        {
          id: "match-2",
          jobPostingId: "job-2",
          score: 74.1,
          reasonSummary: "Partial experience overlap",
          createdAt: "2026-02-11T11:00:00.000Z",
          notificationEvents: [{ decision: "skip", createdAt: "2026-02-11T11:05:00.000Z" }]
        }
      ]
    },
    notificationsByUserId: {
      "u-vis": [
        {
          id: "notif-1",
          matchResultId: "match-1",
          status: "sent",
          decision: "approve",
          eventType: "match_alert",
          sentAt: "2026-02-12T11:05:00.000Z",
          createdAt: "2026-02-12T11:05:00.000Z",
          matchResult: {
            score: 91.2,
            reasonSummary: "Strong backend fit"
          }
        }
      ]
    },
    applicationsByUserId: {
      "u-vis": [
        {
          id: "app-1",
          jobPostingId: "job-1",
          matchResultId: "match-1",
          status: "applied",
          attemptedAt: "2026-02-12T11:10:00.000Z",
          completedAt: "2026-02-12T11:11:00.000Z",
          matchResult: {
            score: 91.2,
            reasonSummary: "Strong backend fit"
          }
        }
      ]
    }
  };

  return {
    userPreference: {
      async findUnique(args: { where: { userId: string } }) {
        return (store.preferencesByUserId[args.where.userId] ?? null) as never;
      },
      async upsert(args: {
        where: { userId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        const existing = store.preferencesByUserId[args.where.userId] ?? {};
        const next = Object.keys(existing).length === 0 ? args.create : { ...existing, ...args.update };
        store.preferencesByUserId[args.where.userId] = next;
        return next as never;
      }
    },
    candidateProfile: {
      async findUnique(args: { where: { userId: string } }) {
        return (store.profileByUserId[args.where.userId] ?? null) as never;
      },
      async upsert(args: {
        where: { userId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        const existing = store.profileByUserId[args.where.userId] ?? {};
        const next = Object.keys(existing).length === 0 ? args.create : { ...existing, ...args.update };
        store.profileByUserId[args.where.userId] = next;
        return next as never;
      }
    }
    ,
    matchResult: {
      async findMany(args: {
        where: { userId: string; notificationEvents?: { some: { decision: string } } };
        take: number;
      }) {
        const source = store.matchesByUserId[args.where.userId] ?? [];
        const filtered = args.where.notificationEvents?.some.decision
          ? source.filter(
              (entry) =>
                Array.isArray(entry.notificationEvents) &&
                entry.notificationEvents.some(
                  (event) => event && typeof event === "object" && event.decision === args.where.notificationEvents?.some.decision
                )
            )
          : source;

        return filtered.slice(0, args.take) as never;
      },
      async count(args: { where: { userId: string } }) {
        return (store.matchesByUserId[args.where.userId] ?? []).length;
      }
    },
    notificationEvent: {
      async findMany(args: { where: { userId: string } }) {
        return (store.notificationsByUserId[args.where.userId] ?? []) as never;
      },
      async count(args: { where: { userId: string; status?: string; decision?: string } }) {
        const source = store.notificationsByUserId[args.where.userId] ?? [];
        return source.filter((entry) => {
          if (args.where.status && entry.status !== args.where.status) {
            return false;
          }
          if (args.where.decision && entry.decision !== args.where.decision) {
            return false;
          }
          return true;
        }).length;
      }
    },
    applicationAttempt: {
      async findMany(args: { where: { userId: string } }) {
        return (store.applicationsByUserId[args.where.userId] ?? []) as never;
      },
      async count(args: { where: { userId: string; status?: string } }) {
        const source = store.applicationsByUserId[args.where.userId] ?? [];
        return source.filter((entry) => (args.where.status ? entry.status === args.where.status : true)).length;
      }
    }
  };
};

test("GET /users/:userId/preferences returns normalized defaults", async () => {
  const app = Fastify();
  registerUserSetupRoutes(app, createMockPrisma() as never);

  const response = await app.inject({
    method: "GET",
    url: "/users/u-1/preferences"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    userId: "u-1",
    desiredTitles: [],
    preferredLocations: [],
    remoteOnly: false,
    minSalary: null,
    maxSalary: null,
    employmentTypes: [],
    notificationSettings: {
      enabled: true,
      maxNotificationsPerHour: 3,
      quietHoursStart: null,
      quietHoursEnd: null,
      timeZone: "UTC"
    },
    matchingInput: {
      desiredTitles: [],
      preferredLocations: [],
      remoteOnly: false,
      minSalary: null
    }
  });

  await app.close();
});

test("PUT /users/:userId/preferences enforces ownership and validates salary bounds", async () => {
  const app = Fastify();
  registerUserSetupRoutes(app, createMockPrisma() as never);

  const forbidden = await app.inject({
    method: "PUT",
    url: "/users/u-2/preferences",
    payload: { desiredTitles: ["Backend Engineer"] }
  });
  assert.equal(forbidden.statusCode, 403);

  const invalid = await app.inject({
    method: "PUT",
    url: "/users/u-2/preferences",
    headers: { "x-user-id": "u-2" },
    payload: { minSalary: 180000, maxSalary: 120000 }
  });
  assert.equal(invalid.statusCode, 400);

  const success = await app.inject({
    method: "PUT",
    url: "/users/u-2/preferences",
    headers: { "x-user-id": "u-2" },
    payload: {
      desiredTitles: [" Backend Engineer ", "Backend Engineer"],
      preferredLocations: ["Remote", "San Francisco"],
      remoteOnly: true,
      minSalary: 150000,
      maxSalary: 220000,
      notificationsEnabled: true,
      maxNotificationsPerHour: 2,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      timeZone: "America/Los_Angeles"
    }
  });

  assert.equal(success.statusCode, 200);
  assert.deepEqual(JSON.parse(success.body).matchingInput, {
    desiredTitles: ["Backend Engineer"],
    preferredLocations: ["Remote", "San Francisco"],
    remoteOnly: true,
    minSalary: 150000
  });

  await app.close();
});

test("PUT /users/:userId/profile validates links and normalizes response", async () => {
  const app = Fastify();
  registerUserSetupRoutes(app, createMockPrisma() as never);

  const invalid = await app.inject({
    method: "PUT",
    url: "/users/u-3/profile",
    headers: { "x-user-id": "u-3" },
    payload: {
      linkedinUrl: "not-a-url"
    }
  });
  assert.equal(invalid.statusCode, 400);

  const success = await app.inject({
    method: "PUT",
    url: "/users/u-3/profile",
    headers: { "x-user-id": "u-3" },
    payload: {
      fullName: "  Ada Lovelace ",
      yearsExperience: 7.26,
      linkedinUrl: "https://www.linkedin.com/in/adal",
      githubUrl: "https://github.com/adal",
      summary: " Platform engineer "
    }
  });

  assert.equal(success.statusCode, 200);
  assert.deepEqual(JSON.parse(success.body), {
    userId: "u-3",
    fullName: "Ada Lovelace",
    phone: null,
    links: {
      linkedinUrl: "https://www.linkedin.com/in/adal",
      githubUrl: "https://github.com/adal"
    },
    yearsExperience: 7.3,
    summary: "Platform engineer",
    matchingInput: {
      skills: [],
      acceptedSeniority: []
    }
  });

  await app.close();
});

test("GET visibility endpoints return matches, notifications, applications, and funnel", async () => {
  const app = Fastify();
  registerUserSetupRoutes(app, createMockPrisma() as never);

  const matchesResponse = await app.inject({
    method: "GET",
    url: "/users/u-vis/matches?decision=approve&limit=5"
  });
  assert.equal(matchesResponse.statusCode, 200);
  const matchesBody = JSON.parse(matchesResponse.body);
  assert.equal(matchesBody.count, 1);
  assert.deepEqual(matchesBody.matches[0], {
    id: "match-1",
    jobPostingId: "job-1",
    score: 91.2,
    reasonSummary: "Strong backend fit",
    createdAt: "2026-02-12T11:00:00.000Z",
    callbackDecision: "approve"
  });

  const notificationsResponse = await app.inject({
    method: "GET",
    url: "/users/u-vis/notifications"
  });
  assert.equal(notificationsResponse.statusCode, 200);
  assert.equal(JSON.parse(notificationsResponse.body).notifications[0].status, "sent");

  const applicationsResponse = await app.inject({
    method: "GET",
    url: "/users/u-vis/applications"
  });
  assert.equal(applicationsResponse.statusCode, 200);
  assert.equal(JSON.parse(applicationsResponse.body).applications[0].status, "applied");

  const funnelResponse = await app.inject({
    method: "GET",
    url: "/users/u-vis/funnel"
  });
  assert.equal(funnelResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(funnelResponse.body), {
    userId: "u-vis",
    funnel: {
      matched: 2,
      notified: 1,
      approved: 1,
      applied: 1
    }
  });

  await app.close();
});
