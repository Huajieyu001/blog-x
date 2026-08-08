import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { administrators, articleTags, articles, categories, sessions, tags } from "../src/db/schema.js";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const origin = "http://127.0.0.1:3100";

test("taxonomy mutations are guarded and public discovery is published-only", async (context) => {
  if (!databaseUrl) { context.skip("AUTH_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database"); return; }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, sessions, articles, categories, tags, articleTags } });
  await pool.query("truncate table sessions, article_tags, articles, categories, tags, administrators cascade");
  context.after(async () => { await pool.query("truncate table sessions, article_tags, articles, categories, tags, administrators cascade"); await pool.end(); });
  const app = await buildApp({ publicOrigin: origin });
  context.after(async () => app.close());

  const unauthenticated = await app.inject({ method: "POST", url: "/admin/categories", payload: { name: "技术", slug: "tech" } });
  assert.equal(unauthenticated.statusCode, 401);
  const wrongOrigin = await app.inject({ method: "POST", url: "/admin/categories", headers: { origin: "https://wrong.invalid" }, payload: { name: "技术", slug: "tech" } });
  assert.equal(wrongOrigin.statusCode, 401);

  const category = await db.insert(categories).values({ name: "技术", slug: "tech" }).returning();
  const tag = await db.insert(tags).values({ name: "TypeScript", slug: "typescript" }).returning();
  const publishedAt = new Date("2026-08-01T00:00:00.000Z");
  const post = await db.insert(articles).values({ title: "公开文章", summary: "摘要", slug: "public-post", markdown: "# public", status: "published", publishedAt, categoryId: category[0]!.id }).returning();
  await db.insert(articleTags).values({ articleId: post[0]!.id, tagId: tag[0]!.id });
  await assert.rejects(db.insert(articleTags).values({ articleId: post[0]!.id, tagId: tag[0]!.id }), (error: unknown) => {
    let current: unknown = error;
    while (current && typeof current === "object") { if ((current as { code?: string }).code === "23505") return true; current = (current as { cause?: unknown }).cause; }
    return false;
  }, "duplicate tag joins conflict");
  await db.insert(articles).values({ title: "草稿", summary: "", slug: "draft-post", markdown: "# draft", status: "draft", categoryId: category[0]!.id });

  const categoriesResponse = await app.inject({ method: "GET", url: "/public/categories" });
  assert.equal(categoriesResponse.statusCode, 200, categoriesResponse.body);
  assert.deepEqual(categoriesResponse.json().items, [{ name: "技术", slug: "tech", articleCount: 1 }], "published-only category index");
  const unknown = await app.inject({ method: "GET", url: "/public/categories/missing/articles" });
  assert.equal(unknown.statusCode, 404);
  const blockedDelete = await app.inject({ method: "DELETE", url: `/admin/categories/${category[0]!.id}`, headers: { origin }, payload: {} });
  assert.equal(blockedDelete.statusCode, 401, "associated delete remains protected");
});
