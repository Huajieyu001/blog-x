import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, articleTags, articles, categories, sessions, tags } from "../src/db/schema.js";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const origin = "http://127.0.0.1:3100";

function sessionCookie(setCookie: string) {
  const match = /^blog_x_session=([^;]+)/.exec(setCookie);
  assert.ok(match, "login must issue a session cookie");
  return `blog_x_session=${match[1]}`;
}

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
  const username = `taxonomy-${Date.now()}`;
  const password = "taxonomy-test-password";
  await seedAdministrator(db, { username, password });
  const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin }, payload: { username, password } });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = sessionCookie(String(login.headers["set-cookie"]));
  const headers = { origin, cookie, "content-type": "application/json" };
  const wrongOrigin = await app.inject({ method: "POST", url: "/admin/categories", headers: { origin: "https://wrong.invalid", cookie }, payload: { name: "技术", slug: "tech" } });
  assert.equal(wrongOrigin.statusCode, 403);

  const apiCreatedCategory = await app.inject({ method: "POST", url: "/admin/categories", headers, payload: { name: "随笔", slug: "notes" } });
  assert.equal(apiCreatedCategory.statusCode, 201, apiCreatedCategory.body);
  assert.deepEqual(Object.keys(apiCreatedCategory.json()).sort(), ["articleCount", "id", "name", "slug"]);
  const apiEditedCategory = await app.inject({ method: "PUT", url: `/admin/categories/${apiCreatedCategory.json().id}`, headers, payload: { name: "生活随笔", slug: "life-notes" } });
  assert.equal(apiEditedCategory.statusCode, 200, apiEditedCategory.body);
  assert.equal(apiEditedCategory.json().name, "生活随笔");
  const apiDeletedCategory = await app.inject({ method: "DELETE", url: `/admin/categories/${apiCreatedCategory.json().id}`, headers, payload: {} });
  assert.equal(apiDeletedCategory.statusCode, 204, apiDeletedCategory.body);

  const category = await db.insert(categories).values({ name: "技术", slug: "tech" }).returning();
  const tag = await db.insert(tags).values({ name: "TypeScript", slug: "typescript" }).returning();
  const secondTag = await db.insert(tags).values({ name: "Fastify", slug: "fastify" }).returning();
  const publishedAt = new Date("2026-08-01T00:00:00.000Z");
  const post = await db.insert(articles).values({ title: "公开文章", summary: "摘要", slug: "public-post", markdown: "# public", status: "published", publishedAt, categoryId: category[0]!.id }).returning();
  await db.insert(articleTags).values({ articleId: post[0]!.id, tagId: tag[0]!.id });
  await assert.rejects(db.insert(articleTags).values({ articleId: post[0]!.id, tagId: tag[0]!.id }), (error: unknown) => {
    let current: unknown = error;
    while (current && typeof current === "object") { if ((current as { code?: string }).code === "23505") return true; current = (current as { cause?: unknown }).cause; }
    return false;
  }, "duplicate tag joins conflict");
  await db.insert(articles).values({ title: "草稿", summary: "", slug: "draft-post", markdown: "# draft", status: "draft", categoryId: category[0]!.id });

  const draftInput = {
    title: "带分类的草稿",
    summary: "",
    coverUrl: "",
    slug: `taxonomy-draft-${Date.now()}`,
    markdown: "# taxonomy",
    publishedAt: null,
    seoDescription: "",
    categoryId: category[0]!.id,
    tagIds: [tag[0]!.id],
  };
  const created = await app.inject({ method: "POST", url: "/admin/posts", headers, payload: draftInput });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().categoryId, category[0]!.id);
  assert.deepEqual(created.json().tagIds, [tag[0]!.id]);
  const reopened = await app.inject({ method: "GET", url: `/admin/posts/${created.json().id}`, headers: { cookie } });
  assert.equal(reopened.statusCode, 200, reopened.body);
  assert.deepEqual(reopened.json().tagIds, [tag[0]!.id]);
  const updated = await app.inject({ method: "PUT", url: `/admin/posts/${created.json().id}`, headers, payload: { ...draftInput, tagIds: [secondTag[0]!.id] } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.deepEqual(updated.json().tagIds, [secondTag[0]!.id], "tag associations are replaced transactionally");
  const storedTags = await db.select().from(articleTags);
  assert.equal(storedTags.some((row) => row.articleId === created.json().id && row.tagId === tag[0]!.id), false);
  assert.equal(storedTags.some((row) => row.articleId === created.json().id && row.tagId === secondTag[0]!.id), true);

  const invalidReference = await app.inject({ method: "POST", url: "/admin/posts", headers, payload: { ...draftInput, slug: `${draftInput.slug}-invalid`, categoryId: "00000000-0000-4000-8000-000000000000" } });
  assert.equal(invalidReference.statusCode, 400);
  assert.deepEqual(invalidReference.json(), { error: "validation_failed", fields: { taxonomy: ["所选分类或标签不存在"] } });

  const categoriesResponse = await app.inject({ method: "GET", url: "/public/categories" });
  assert.equal(categoriesResponse.statusCode, 200, categoriesResponse.body);
  assert.deepEqual(categoriesResponse.json().items, [{ name: "技术", slug: "tech", articleCount: 1 }], "published-only category index");
  const unknown = await app.inject({ method: "GET", url: "/public/categories/missing/articles" });
  assert.equal(unknown.statusCode, 404);
  const blockedDelete = await app.inject({ method: "DELETE", url: `/admin/categories/${category[0]!.id}`, headers, payload: {} });
  assert.equal(blockedDelete.statusCode, 409, blockedDelete.body);
  assert.equal(blockedDelete.json().error, "associated_delete");
  assert.ok(blockedDelete.json().articleCount >= 1);
  const retainedCategory = await db.select().from(categories);
  assert.equal(retainedCategory.some((row) => row.id === category[0]!.id), true, "associated delete retains the category");
});
