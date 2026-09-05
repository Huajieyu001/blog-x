import assert from "node:assert/strict";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyPluginAsync } from "fastify";
import { adminAnalyticsRoutes } from "../src/routes/admin-analytics.js";

const validAnalytics = {
  range: 30,
  timezone: "Asia/Shanghai",
  fromDay: "2026-08-07",
  toDay: "2026-09-05",
  totalPv: 3,
  daily: Array.from({ length: 30 }, (_, index) => ({
    day: `2026-${index < 25 ? "08" : "09"}-${String(index < 25 ? index + 7 : index - 24).padStart(2, "0")}`,
    pv: index === 29 ? 3 : 0,
  })),
  sources: [
    { source: "direct", totalPv: 3 },
    { source: "internal", totalPv: 0 },
    { source: "search", totalPv: 0 },
    { source: "social", totalPv: 0 },
    { source: "external", totalPv: 0 },
  ],
  topArticles: [{ articleId: "00000000-0000-4000-8000-000000000001", title: "Published article", status: "published", totalPv: 3 }],
} as const;

async function createAnalyticsApp({ failing = false } = {}) {
  let repositoryCalls = 0;
  const app = Fastify({ logger: { level: "silent" } });
  await app.register(cookie as unknown as FastifyPluginAsync);
  await app.register(adminAnalyticsRoutes, {
    sessionAuth: {
      administratorIdForToken: async (token) => token === "valid" ? "administrator-id" : null,
      issue: async () => "",
      revoke: async () => undefined,
    },
    adminAnalyticsRepository: {
      read: async () => {
        repositoryCalls += 1;
        if (failing) throw new Error("private database detail");
        return validAnalytics;
      },
    },
  });
  return { app, repositoryCalls: () => repositoryCalls };
}

test("analytics is session-first, private no-store, and does not call the repository for anonymous requests", async (context) => {
  const { app, repositoryCalls } = await createAnalyticsApp();
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/admin/analytics?range=not-a-range&limit=999" });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "unauthorized" });
  assert.equal(response.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(repositoryCalls(), 0);
});

test("analytics validates exact scalar query values and returns a strict no-store response", async (context) => {
  const { app, repositoryCalls } = await createAnalyticsApp();
  context.after(() => app.close());
  const headers = { cookie: "blog_x_session=valid" };

  const success = await app.inject({ method: "GET", url: "/admin/analytics?range=30&limit=1", headers });
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.json(), validAnalytics);
  assert.equal(success.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(repositoryCalls(), 1);

  for (const query of [
    "", "?range=30", "?limit=1", "?range=6&limit=1", "?range=30&limit=0", "?range=30&limit=9",
    "?range=30&limit=1&limit=2", "?range=30&limit=1&extra=x", "?range=30.0&limit=1",
    "?range=+30&limit=1", "?range=%2030&limit=1", "?range=30&limit=01",
  ]) {
    const response = await app.inject({ method: "GET", url: `/admin/analytics${query}`, headers });
    assert.equal(response.statusCode, 400, query || "missing query");
    assert.deepEqual(response.json(), { error: "invalid_query" });
    assert.equal(response.headers["cache-control"], "private, no-store, max-age=0");
  }
  assert.equal(repositoryCalls(), 1);
});

test("analytics hides repository failures behind a non-cacheable unavailable response", async (context) => {
  const { app } = await createAnalyticsApp({ failing: true });
  context.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/admin/analytics?range=30&limit=1", headers: { cookie: "blog_x_session=valid" } });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "analytics_unavailable" });
  assert.equal(response.headers["cache-control"], "private, no-store, max-age=0");
});
