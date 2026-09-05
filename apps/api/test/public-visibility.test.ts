import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, articleDailyViews, articles, auditEvents, sessions } from "../src/db/schema.js";

const databaseUrl = process.env.PUBLIC_VISIBILITY_TEST_DATABASE_URL;
const publicOrigin = "http://127.0.0.1:3100";

function sessionCookie(setCookie: string) {
  const match = /^blog_x_session=([^;]+)/.exec(setCookie);
  assert.ok(match, "login must issue a session cookie");
  return `blog_x_session=${match[1]}`;
}

test("lifecycle changes are reflected by the next public list request", async (context) => {
  if (!databaseUrl) {
    context.skip("PUBLIC_VISIBILITY_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, sessions } });
  await pool.query("truncate table sessions, articles, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, articles, administrators cascade");
    await pool.end();
  });

  const username = `public-visibility-${Date.now()}`;
  const password = "public-visibility-password";
  await seedAdministrator(db, { username, password });
  const app = await buildApp({ publicOrigin });
  context.after(async () => { await app.close(); });

  const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin: publicOrigin }, payload: { username, password } });
  const headers = { origin: publicOrigin, cookie: sessionCookie(String(login.headers["set-cookie"])), "content-type": "application/json" };
  const slug = `public-visibility-${Date.now()}`;
  const input = { title: "Visibility article", summary: "Visibility summary", coverUrl: "", slug, markdown: "# Visible", publishedAt: null, seoDescription: "" };

  const created = await app.inject({ method: "POST", url: "/admin/posts", headers, payload: input });
  assert.equal(created.statusCode, 201);

  async function publicList() {
    const response = await app.inject({ method: "GET", url: "/public/articles?page=1" });
    assert.equal(response.statusCode, 200);
    return response.json() as { totalItems: number; items: Array<{ slug: string }> };
  }

  assert.deepEqual(await publicList(), { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] });

  const published = await app.inject({ method: "POST", url: `/admin/posts/${created.json().id}/publish`, headers, payload: {} });
  assert.equal(published.statusCode, 200);
  assert.equal((await publicList()).items.some((post) => post.slug === slug), true);

  const unpublished = await app.inject({ method: "POST", url: `/admin/posts/${created.json().id}/unpublish`, headers, payload: {} });
  assert.equal(unpublished.statusCode, 200);
  assert.deepEqual(await publicList(), { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] });

  const republished = await app.inject({ method: "POST", url: `/admin/posts/${created.json().id}/republish`, headers, payload: {} });
  assert.equal(republished.statusCode, 200);
  assert.equal((await publicList()).items.some((post) => post.slug === slug), true);

  const deleted = await app.inject({ method: "POST", url: `/admin/posts/${created.json().id}/delete`, headers, payload: {} });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(await publicList(), { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] });
});

test("public detail exposes only published content, uses one renderer, and gives every unavailable slug the same response", async (context) => {
  if (!databaseUrl) {
    context.skip("PUBLIC_VISIBILITY_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, sessions } });
  await pool.query("truncate table sessions, articles, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, articles, administrators cascade");
    await pool.end();
  });

  const username = `public-detail-${Date.now()}`;
  const password = "public-detail-password";
  await seedAdministrator(db, { username, password });
  const app = await buildApp({ publicOrigin });
  context.after(async () => { await app.close(); });

  const markdown = [
    "# Shared renderer",
    "",
    "## 中文 API",
    "",
    "| State | Visible |",
    "| --- | --- |",
    "| published | yes |",
    "",
    "```ts",
    "const visible = true;",
    "```",
    "",
    "<script>alert(1)</script>",
    "[unsafe](javascript:alert(1))",
  ].join("\n");
  const now = new Date();
  const slugs = {
    published: `detail-published-${Date.now()}`,
    draft: `detail-draft-${Date.now()}`,
    unpublished: `detail-unpublished-${Date.now()}`,
    deleted: `detail-deleted-${Date.now()}`,
  };
  await db.insert(articles).values([
    { title: "Published detail", summary: "Public summary", slug: slugs.published, markdown, seoDescription: "Public SEO description", status: "published", publishedAt: now },
    { title: "Draft detail", summary: "Secret draft", slug: slugs.draft, markdown, status: "draft", publishedAt: null },
    { title: "Unpublished detail", summary: "Secret unpublished", slug: slugs.unpublished, markdown, status: "unpublished", publishedAt: now },
    { title: "Deleted detail", summary: "Secret deleted", slug: slugs.deleted, markdown, status: "published", publishedAt: now, deletedAt: now },
  ]);

  const published = await app.inject({ method: "GET", url: `/public/articles/${slugs.published}` });
  assert.equal(published.statusCode, 200);
  assert.deepEqual(Object.keys(published.json()).sort(), ["category", "publishedAt", "renderedHtml", "seoDescription", "slug", "status", "summary", "tags", "title", "toc"]);
  assert.equal(published.json().category, null);
  assert.deepEqual(published.json().tags, []);
  assert.equal(published.json().status, "published");
  assert.equal(published.json().summary, "Public summary");
  assert.equal(published.json().seoDescription, "Public SEO description");
  assert.deepEqual(published.json().toc, [{ id: "中文-api", depth: 2, text: "中文 API" }]);
  assert.match(published.json().renderedHtml, /<h2 id="中文-api">/);
  assert.match(published.json().renderedHtml, /<table>/);
  assert.match(published.json().renderedHtml, /class="shiki github-light"/);
  assert.doesNotMatch(published.json().renderedHtml, /<script|javascript:/i);

  const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin: publicOrigin }, payload: { username, password } });
  const preview = await app.inject({
    method: "POST",
    url: "/admin/posts/preview",
    headers: { origin: publicOrigin, cookie: sessionCookie(String(login.headers["set-cookie"])) },
    payload: { markdown },
  });
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.json().html, published.json().renderedHtml);

  const unavailable = await Promise.all([
    slugs.draft,
    slugs.unpublished,
    slugs.deleted,
    `detail-unknown-${Date.now()}`,
  ].map((slug) => app.inject({ method: "GET", url: `/public/articles/${slug}` })));
  for (const response of unavailable) {
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "not_found" });
  }
  assert.equal(new Set(unavailable.map((response) => response.body)).size, 1);
});

test("anonymous article views use an opaque public predicate and atomic Shanghai-day aggregate", async (context) => {
  if (!databaseUrl) {
    context.skip("PUBLIC_VISIBILITY_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articleDailyViews, articles, auditEvents, sessions } });
  await pool.query("truncate table article_daily_views, audit_events, sessions, articles, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table article_daily_views, audit_events, sessions, articles, administrators cascade");
    await pool.end();
  });

  const suffix = Date.now();
  const slugs = {
    published: `view-published-${suffix}`,
    draft: `view-draft-${suffix}`,
    unpublished: `view-unpublished-${suffix}`,
    deleted: `view-deleted-${suffix}`,
    future: `view-future-${suffix}`,
    nullPublication: `view-null-${suffix}`,
  };
  const now = new Date();
  await db.insert(articles).values([
    { title: "Published", slug: slugs.published, markdown: "# Published", status: "published", publishedAt: now },
    { title: "Draft", slug: slugs.draft, markdown: "# Draft", status: "draft" },
    { title: "Unpublished", slug: slugs.unpublished, markdown: "# Unpublished", status: "unpublished", publishedAt: now },
    { title: "Deleted", slug: slugs.deleted, markdown: "# Deleted", status: "published", publishedAt: now, deletedAt: now },
    { title: "Future", slug: slugs.future, markdown: "# Future", status: "published", publishedAt: new Date(now.getTime() + 60_000) },
    { title: "Null publication", slug: slugs.nullPublication, markdown: "# Null", status: "published", publishedAt: null },
  ]);

  const app = await buildApp({ publicOrigin });
  context.after(async () => { await app.close(); });
  const headers = { origin: publicOrigin, "content-type": "application/json" };
  const view = (slug: string, payload: unknown = {}) => app.inject({ method: "POST", url: `/public/articles/${slug}/view`, headers, payload });
  const opaque = (response: Awaited<ReturnType<typeof view>>) => ({
    statusCode: response.statusCode,
    body: response.body,
    cacheControl: response.headers["cache-control"],
  });

  const counted = await view(slugs.published);
  assert.deepEqual(opaque(counted), { statusCode: 204, body: "", cacheControl: "no-store" });

  const hidden = await Promise.all([
    view(slugs.draft),
    view(slugs.unpublished),
    view(slugs.deleted),
    view(slugs.future),
    view(slugs.nullPublication),
    view(`view-unknown-${suffix}`),
    view(slugs.published, { ignored: true }),
    app.inject({ method: "POST", url: `/public/articles/${slugs.published}/view`, headers: { "content-type": "application/json" }, payload: {} }),
  ]);
  for (const response of hidden) assert.deepEqual(opaque(response), opaque(counted));

  const day = (await pool.query<{ day: string }>("select (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date::text as day")).rows[0]?.day;
  const articleId = (await pool.query<{ id: string }>("select id from articles where slug = $1", [slugs.published])).rows[0]?.id;
  const firstRow = await db.select().from(articleDailyViews);
  assert.deepEqual(firstRow, [{
    articleId,
    day,
    totalPv: 1,
    directPv: 1,
    internalPv: 0,
    searchPv: 0,
    socialPv: 0,
    externalPv: 0,
  }]);
  assert.equal(Number((await pool.query("select count(*)::int as count from audit_events")).rows[0]?.count), 0);

  const parallel = await Promise.all(Array.from({ length: 24 }, () => view(slugs.published)));
  for (const response of parallel) assert.deepEqual(opaque(response), opaque(counted));
  const aggregate = (await pool.query<{ total_pv: number; source_sum: number }>("select total_pv, direct_pv + internal_pv + search_pv + social_pv + external_pv as source_sum from article_daily_views")).rows[0];
  assert.deepEqual(aggregate, { total_pv: 25, source_sum: 25 });

  const failedApp = await buildApp({
    publicOrigin,
    viewAggregationRepository: { recordPublicView: async () => { throw new Error("disposable database failure"); } },
  });
  context.after(async () => { await failedApp.close(); });
  assert.deepEqual(opaque(await failedApp.inject({ method: "POST", url: `/public/articles/${slugs.published}/view`, headers, payload: {} })), opaque(counted));
});
