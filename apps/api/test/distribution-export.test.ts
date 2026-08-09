import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, articles, sessions } from "../src/db/schema.js";

const databaseUrl = process.env.PHASE3_TEST_DATABASE_URL;
const origin = "http://127.0.0.1:3100";

function sessionCookie(setCookie: string) {
  const match = /^blog_x_session=([^;]+)/.exec(setCookie);
  assert.ok(match, "login must issue a session cookie");
  return `blog_x_session=${match[1]}`;
}

test("a retained Markdown draft travels through the protected versioned export attachment", async () => {
  if (!databaseUrl) throw new Error("PHASE3_TEST_DATABASE_URL must name the runner-owned disposable migrated PostgreSQL database");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, sessions } });
  await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
  const username = `export-${Date.now()}`;
  const password = "export-test-password";
  await seedAdministrator(db, { username, password });
  await db.insert(articles).values({
    id: "00000000-0000-4000-8000-000000000001",
    title: "保留草稿",
    summary: "strict manifest tracer",
    slug: "retained-unicode-draft",
    markdown: "# 原文\n\n<script>alert('never render')</script>\n\n中文 ✅",
    seoDescription: "source authority",
    status: "draft",
  });
  const app = await buildApp({ publicOrigin: origin });
  try {
    const unauthenticated = await app.inject({ method: "POST", url: "/admin/export" });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(unauthenticated.headers["cache-control"], "no-store");

    const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin }, payload: { username, password } });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = sessionCookie(String(login.headers["set-cookie"]));
    for (const requestOrigin of [undefined, "https://wrong.invalid"]) {
      const rejected = await app.inject({ method: "POST", url: "/admin/export", headers: { cookie, ...(requestOrigin ? { origin: requestOrigin } : {}) } });
      assert.equal(rejected.statusCode, 403);
      assert.equal(rejected.headers["cache-control"], "no-store");
    }

    const exported = await app.inject({ method: "POST", url: "/admin/export", headers: { cookie, origin } });
    assert.equal(exported.statusCode, 200, exported.body);
    assert.equal(exported.headers["cache-control"], "no-store");
    assert.equal(exported.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(exported.headers["content-disposition"], 'attachment; filename="blog-x-export-v1.json"');
    const manifest = exported.json();
    assert.equal(manifest.format, "blog-x-portable-export");
    assert.equal(manifest.version, 1);
    assert.equal(manifest.articles[0].markdown, "# 原文\n\n<script>alert('never render')</script>\n\n中文 ✅");
  } finally {
    await app.close();
    await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
    await pool.end();
  }
});
