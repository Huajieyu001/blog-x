import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { administrators, articles, sessions } from "../src/db/schema.js";

const databaseUrl = process.env.PUBLIC_LIST_TEST_DATABASE_URL;

test("public list is publication-only, deterministic, and explicitly paginated", async (context) => {
  if (!databaseUrl) {
    context.skip("PUBLIC_LIST_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, sessions } });
  await pool.query("truncate table sessions, articles, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, articles, administrators cascade");
    await pool.end();
  });

  const tiedPublication = new Date("2026-08-01T12:00:00.000Z");
  const olderPublication = new Date("2026-07-01T12:00:00.000Z");
  const published = Array.from({ length: 12 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `Published ${index + 1}`,
    summary: `Summary ${index + 1}`,
    slug: `published-${index + 1}`,
    markdown: `# Published ${index + 1}`,
    status: "published",
    publishedAt: index < 11 ? tiedPublication : olderPublication,
  }));
  await db.insert(articles).values([
    ...published,
    { title: "Hidden draft", summary: "private", slug: "hidden-draft", markdown: "secret", status: "draft", publishedAt: null },
    { title: "Hidden unpublished", summary: "private", slug: "hidden-unpublished", markdown: "secret", status: "unpublished", publishedAt: tiedPublication },
    { title: "Hidden deleted", summary: "private", slug: "hidden-deleted", markdown: "secret", status: "published", publishedAt: tiedPublication, deletedAt: new Date() },
    { title: "Broken published row", summary: "private", slug: "hidden-null-date", markdown: "secret", status: "published", publishedAt: null },
  ]);

  const app = await buildApp({ publicOrigin: "http://127.0.0.1:3100" });
  context.after(async () => { await app.close(); });

  const first = await app.inject({ method: "GET", url: "/public/articles?page=1" });
  assert.equal(first.statusCode, 200, first.body);
  assert.deepEqual(first.json(), {
    page: 1,
    pageSize: 10,
    totalItems: 12,
    totalPages: 2,
    items: Array.from({ length: 10 }, (_, offset) => {
      const index = 10 - offset;
      return {
        title: `Published ${index + 1}`,
        summary: `Summary ${index + 1}`,
        slug: `published-${index + 1}`,
        publishedAt: tiedPublication.toISOString(),
        status: "published",
        category: null,
        tags: [],
      };
    }),
  });

  const repeated = await app.inject({ method: "GET", url: "/public/articles?page=1" });
  assert.deepEqual(repeated.json(), first.json(), "tied timestamps must use stable ID-desc ordering");

  const second = await app.inject({ method: "GET", url: "/public/articles?page=2" });
  assert.equal(second.statusCode, 200);
  assert.deepEqual(second.json(), {
    page: 2,
    pageSize: 10,
    totalItems: 12,
    totalPages: 2,
    items: [
      { title: "Published 1", summary: "Summary 1", slug: "published-1", publishedAt: tiedPublication.toISOString(), status: "published", category: null, tags: [] },
      { title: "Published 12", summary: "Summary 12", slug: "published-12", publishedAt: olderPublication.toISOString(), status: "published", category: null, tags: [] },
    ],
  });

  const beyond = await app.inject({ method: "GET", url: "/public/articles?page=3" });
  assert.equal(beyond.statusCode, 200);
  assert.deepEqual(beyond.json(), { page: 3, pageSize: 10, totalItems: 12, totalPages: 2, items: [] });

  for (const query of ["page=0", "page=-1", "page=1.5", "page=abc", "page=", "status=draft", "preview=true"]) {
    const invalid = await app.inject({ method: "GET", url: `/public/articles?${query}` });
    assert.equal(invalid.statusCode, 400, `${query} must be rejected`);
    assert.deepEqual(invalid.json(), { error: "invalid_page" });
  }
});
