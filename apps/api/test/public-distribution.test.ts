import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema.js";

const databaseUrl = process.env.PHASE3_TEST_DATABASE_URL;

test("Phase 3 runner supplies a migrated disposable database for semantic tests", async (context) => {
  if (!databaseUrl) throw new Error("PHASE3_TEST_DATABASE_URL must name the runner-owned disposable migrated PostgreSQL database");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
    await pool.end();
  });

  const slug = "phase-3-runner-sentinel";
  await db.insert(schema.articles).values({
    title: "Phase 3 runner sentinel",
    summary: "generated database create/read proof",
    slug,
    markdown: "source stays in the database",
    status: "draft",
  });
  const created = await db.select({ title: schema.articles.title, slug: schema.articles.slug })
    .from(schema.articles)
    .where(eq(schema.articles.slug, slug));
  assert.deepEqual(created, [{ title: "Phase 3 runner sentinel", slug }]);
});
