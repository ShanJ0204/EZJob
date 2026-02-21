import test from "node:test";
import assert from "node:assert/strict";

import Fastify from "fastify";

import { registerUserSetupRoutes } from "./routes.js";

const createMockPrisma = () => {
  const store: {
    preferencesByUserId: Record<string, Record<string, unknown>>;
    profileByUserId: Record<string, Record<string, unknown>>;
  } = {
    preferencesByUserId: {},
    profileByUserId: {}
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
