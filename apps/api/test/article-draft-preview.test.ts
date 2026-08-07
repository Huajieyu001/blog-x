import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, articles, sessions } from "../src/db/schema.js";

const databaseUrl = process.env.ARTICLE_TEST_DATABASE_URL;
const publicOrigin = "http://127.0.0.1:3100";

function sessionCookie(setCookie: string) {
  const match = /^blog_x_session=([^;]+)/.exec(setCookie);
  assert.ok(match, "login must issue a session cookie");
  return `blog_x_session=${match[1]}`;
}

test("draft metadata round-trips, slugs stay reserved, and preview uses the safe public renderer", async (context) => {
  if (!databaseUrl) {
    context.skip("ARTICLE_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, sessions } });
  const username = `draft-test-${Date.now()}`;
  const password = "draft-test-password";
  await pool.query("truncate table sessions, articles, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, articles, administrators cascade");
    await pool.end();
  });

  await seedAdministrator(db, { username, password });
  const app = await buildApp({ publicOrigin });
  context.after(async () => { await app.close(); });

  const missingSession = await app.inject({
    method: "GET",
    url: "/admin/posts/00000000-0000-4000-8000-000000000000",
  });
  assert.equal(missingSession.statusCode, 401);
  assert.deepEqual(missingSession.json(), { error: "unauthorized" });

  const rejectedPreview = await app.inject({
    method: "POST",
    url: "/admin/posts/preview",
    headers: { origin: publicOrigin, "content-type": "application/json" },
    payload: { markdown: "# Secret draft" },
  });
  assert.equal(rejectedPreview.statusCode, 401);

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { origin: publicOrigin, "content-type": "application/json" },
    payload: { username, password },
  });
  const cookie = sessionCookie(String(login.headers["set-cookie"]));
  const headers = { origin: publicOrigin, cookie, "content-type": "application/json" };

  const invalid = await app.inject({
    method: "POST",
    url: "/admin/posts",
    headers,
    payload: { title: "", summary: "x", coverUrl: "not a url", slug: "Bad Slug", markdown: "", publishedAt: "yesterday", seoDescription: "x" },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error, "validation_failed");
  assert.deepEqual(Object.keys(invalid.json().fields).sort(), ["coverUrl", "markdown", "publishedAt", "slug", "title"]);

  const suggestion = await app.inject({
    method: "GET",
    url: `/admin/posts/slug-suggestion?title=${encodeURIComponent("你好 TypeScript Café")}`,
    headers: { cookie },
  });
  assert.equal(suggestion.statusCode, 200);
  assert.deepEqual(suggestion.json(), { slug: "你好-typescript-café" });

  const original = {
    title: "完整草稿",
    summary: "这是摘要",
    coverUrl: "https://images.example.test/cover.png",
    slug: `complete-draft-${Date.now()}`,
    markdown: "# 初稿\n\n正文 **加粗**",
    publishedAt: "2026-08-07T08:30:00.000Z",
    seoDescription: "用于搜索结果的描述",
  };
  const created = await app.inject({ method: "POST", url: "/admin/posts", headers, payload: original });
  assert.equal(created.statusCode, 201);
  assert.match(created.headers.location ?? "", /^\/admin\/posts\/[0-9a-f-]+$/);
  const createdBody = created.json();
  assert.match(createdBody.id, /^[0-9a-f-]+$/);
  assert.deepEqual(created.json(), {
    id: createdBody.id,
    ...original,
    status: "draft",
  });

  const reopened = await app.inject({ method: "GET", url: `/admin/posts/${created.json().id}`, headers: { cookie } });
  assert.equal(reopened.statusCode, 200);
  assert.deepEqual(reopened.json(), created.json());
  const hiddenDraft = await app.inject({ method: "GET", url: `/public/articles/${original.slug}` });
  assert.equal(hiddenDraft.statusCode, 404);

  const updatedInput = { ...original, title: "修改后的标题", summary: "修改后的摘要", markdown: "# 修改后", publishedAt: null };
  const updated = await app.inject({ method: "PUT", url: `/admin/posts/${created.json().id}`, headers, payload: updatedInput });
  assert.equal(updated.statusCode, 200);
  assert.deepEqual(updated.json(), { id: created.json().id, ...updatedInput, status: "draft" });

  const reservedSlug = `reserved-${Date.now()}`;
  const reserved = await app.inject({ method: "POST", url: "/admin/posts", headers, payload: { ...original, slug: reservedSlug } });
  assert.equal(reserved.statusCode, 201);
  await pool.query("update articles set deleted_at = now() where id = $1", [reserved.json().id]);
  const conflict = await app.inject({ method: "POST", url: "/admin/posts", headers, payload: { ...original, slug: reservedSlug } });
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(conflict.json(), { error: "slug_conflict", fields: { slug: ["Slug 已被占用"] } });

  const hostileMarkdown = "# Safe\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n```ts\nconst value = 1;\n```";
  const beforePreview = await pool.query("select count(*)::int as count from articles");
  const preview = await app.inject({ method: "POST", url: "/admin/posts/preview", headers, payload: { markdown: hostileMarkdown } });
  assert.equal(preview.statusCode, 200);
  assert.match(preview.json().html, /<h1>Safe<\/h1>/);
  assert.match(preview.json().html, /class="shiki github-light"/);
  assert.match(preview.json().html, /style="[^"]+"/);
  assert.doesNotMatch(preview.json().html, /<script|javascript:|onerror=/i);
  const afterPreview = await pool.query("select count(*)::int as count from articles");
  assert.equal(afterPreview.rows[0].count, beforePreview.rows[0].count);

  const publicSlug = `renderer-parity-${Date.now()}`;
  await db.insert(articles).values({ title: "Renderer parity", slug: publicSlug, markdown: hostileMarkdown, status: "published", publishedAt: new Date() });
  const publicArticle = await app.inject({ method: "GET", url: `/public/articles/${publicSlug}` });
  assert.equal(publicArticle.statusCode, 200);
  assert.equal(preview.json().html, publicArticle.json().html);
});
