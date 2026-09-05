import assert from "node:assert/strict";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyPluginAsync } from "fastify";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createAdminAnalyticsRepository } from "../src/content/admin-analytics-repository.js";
import * as schema from "../src/db/schema.js";
import { adminAnalyticsRoutes } from "../src/routes/admin-analytics.js";

const databaseUrl = process.env.ADMIN_ANALYTICS_TEST_DATABASE_URL;

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

test("analytics aggregates only currently public articles and restores stored PV when republished", async (context) => {
  if (!databaseUrl) throw new Error("ADMIN_ANALYTICS_TEST_DATABASE_URL must name a generated disposable migrated PostgreSQL database");
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repository = createAdminAnalyticsRepository(db);
  context.after(async () => {
    await pool.query("truncate table article_daily_views, articles cascade");
    await pool.end();
  });
  await pool.query("truncate table article_daily_views, articles cascade");
  const visibleId = "00000000-0000-4000-8000-000000000101";
  const hiddenIds = ["00000000-0000-4000-8000-000000000102", "00000000-0000-4000-8000-000000000103", "00000000-0000-4000-8000-000000000104", "00000000-0000-4000-8000-000000000105", "00000000-0000-4000-8000-000000000106"];
  await pool.query(`
    INSERT INTO articles (id, title, slug, markdown, status, published_at, deleted_at)
    VALUES
      ($1, 'Visible', 'analytics-visible', '# visible', 'published', CURRENT_TIMESTAMP, NULL),
      ($2, 'Draft', 'analytics-draft', '# draft', 'draft', NULL, NULL),
      ($3, 'Unpublished', 'analytics-unpublished', '# unpublished', 'unpublished', CURRENT_TIMESTAMP, NULL),
      ($4, 'Deleted', 'analytics-deleted', '# deleted', 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ($5, 'No publication', 'analytics-null', '# null', 'published', NULL, NULL),
      ($6, 'Future', 'analytics-future', '# future', 'published', CURRENT_TIMESTAMP + interval '1 day', NULL)
  `, [visibleId, ...hiddenIds]);
  await pool.query(`
    WITH bounds AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AS today)
    INSERT INTO article_daily_views (article_id, day, total_pv, direct_pv, search_pv)
    SELECT $1::uuid, today, 5, 5, 0 FROM bounds
    UNION ALL SELECT $1::uuid, today - 2, 1, 0, 1 FROM bounds
    UNION ALL SELECT $2::uuid, today, 9, 9, 0 FROM bounds
    UNION ALL SELECT $3::uuid, today, 9, 9, 0 FROM bounds
    UNION ALL SELECT $4::uuid, today, 9, 9, 0 FROM bounds
    UNION ALL SELECT $5::uuid, today, 9, 9, 0 FROM bounds
    UNION ALL SELECT $6::uuid, today, 9, 9, 0 FROM bounds
  `, [visibleId, ...hiddenIds]);

  for (const range of [7, 30, 90, 400] as const) {
    const result = await repository.read({ range, limit: 8 });
    assert.equal(result.daily.length, range);
    assert.equal(result.daily.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.day)), true);
    assert.equal(result.daily.at(-1)?.day, result.toDay);
    assert.equal(result.daily.reduce((sum, point) => sum + point.pv, 0), 6);
  }
  const visible = await repository.read({ range: 7, limit: 8 });
  assert.equal(visible.daily.length, 7);
  assert.equal(visible.totalPv, 6);
  assert.deepEqual(visible.sources, [
    { source: "direct", totalPv: 5 }, { source: "internal", totalPv: 0 }, { source: "search", totalPv: 1 }, { source: "social", totalPv: 0 }, { source: "external", totalPv: 0 },
  ]);
  assert.deepEqual(visible.topArticles, [{ articleId: visibleId, title: "Visible", status: "published", totalPv: 6 }]);

  await pool.query("update articles set status = 'unpublished' where id = $1", [visibleId]);
  const hidden = await repository.read({ range: 7, limit: 8 });
  assert.equal(hidden.totalPv, 0);
  assert.equal(hidden.daily.reduce((sum, point) => sum + point.pv, 0), 0);
  assert.equal(hidden.sources.reduce((sum, source) => sum + source.totalPv, 0), 0);
  assert.deepEqual(hidden.topArticles, []);
  assert.equal((await pool.query("select count(*)::int as count from article_daily_views where article_id = $1", [visibleId])).rows[0]?.count, 2);

  await pool.query("update articles set status = 'published' where id = $1", [visibleId]);
  assert.equal((await repository.read({ range: 7, limit: 8 })).totalPv, 6);
});
