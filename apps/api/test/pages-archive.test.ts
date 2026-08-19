import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, articles, sessions, sitePages } from "../src/db/schema.js";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const origin = "http://127.0.0.1:3100";

function sessionCookie(setCookie: string) {
  const match = /^blog_x_session=([^;]+)/.exec(setCookie);
  assert.ok(match, "login must issue a session cookie");
  return `blog_x_session=${match[1]}`;
}

test("About stale draft/published boundary and deterministic archive are enforced", async (context) => {
  if (!databaseUrl) {
    context.skip("AUTH_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, sessions, sitePages } });
  await pool.query("truncate table sessions, article_tags, articles, site_pages, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, article_tags, articles, site_pages, administrators cascade");
    await pool.end();
  });

  const username = `pages-${Date.now()}`;
  const password = "pages-archive-password";
  await seedAdministrator(db, { username, password });
  const app = await buildApp({ publicOrigin: origin });
  context.after(async () => { await app.close(); });

  const unauthenticated = await app.inject({ method: "GET", url: "/admin/about" });
  assert.equal(unauthenticated.statusCode, 401);
  const missingPublic = await app.inject({ method: "GET", url: "/public/about" });
  assert.equal(missingPublic.statusCode, 404);
  assert.deepEqual(missingPublic.json(), { error: "not_found" });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { origin },
    payload: { username, password },
  });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = sessionCookie(String(login.headers["set-cookie"]));
  const headers = { origin, cookie, "content-type": "application/json" };

  const wrongOrigin = await app.inject({
    method: "POST",
    url: "/admin/about",
    headers: { ...headers, origin: "https://wrong.invalid" },
    payload: { title: "About", markdown: "# About", version: null },
  });
  assert.equal(wrongOrigin.statusCode, 403);
  const unknownField = await app.inject({
    method: "POST",
    url: "/admin/about",
    headers,
    payload: { title: "About", markdown: "# About", version: null, status: "published" },
  });
  assert.equal(unknownField.statusCode, 400);

  await assert.rejects(
    pool.query("insert into site_pages (key, title, markdown) values ('contact', 'Contact', '')"),
    (error: unknown) => (error as { code?: string }).code === "23514",
    "the database allows only the immutable about key",
  );
  await assert.rejects(
    pool.query("insert into site_pages (key, title, markdown, status) values ('about', 'About', '', 'archived')"),
    (error: unknown) => (error as { code?: string }).code === "23514",
    "the database allows only draft/published page states",
  );

  const concurrent = await Promise.all([
    app.inject({ method: "POST", url: "/admin/about", headers, payload: { title: "About A", markdown: "# A", version: null } }),
    app.inject({ method: "POST", url: "/admin/about", headers, payload: { title: "About B", markdown: "# B", version: null } }),
  ]);
  assert.deepEqual(concurrent.map((response) => response.statusCode).sort(), [200, 409], "first-write races converge without a unique-key 500");

  const initial = await app.inject({ method: "GET", url: "/admin/about", headers: { cookie } });
  assert.equal(initial.statusCode, 200, initial.body);
  assert.deepEqual(Object.keys(initial.json()).sort(), ["id", "markdown", "status", "title", "version"]);
  assert.equal(initial.json().status, "draft");
  assert.equal((await app.inject({ method: "GET", url: "/public/about" })).body, missingPublic.body, "draft and absent About share one public 404");

  const hostileMarkdown = "# Safe About\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n```ts\nconst safe = true;\n```";
  const preview = await app.inject({
    method: "POST",
    url: "/admin/about/preview",
    headers,
    payload: { title: "About", markdown: hostileMarkdown, version: initial.json().version },
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.deepEqual(Object.keys(preview.json()), ["html"]);
  assert.match(preview.json().html, /<h1>Safe About<\/h1>/);
  assert.doesNotMatch(preview.json().html, /<script|javascript:/i);

  const saved = await app.inject({
    method: "POST",
    url: "/admin/about",
    headers,
    payload: { title: "关于本站", markdown: hostileMarkdown, version: initial.json().version },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.notEqual(saved.json().version, initial.json().version, "successful writes advance the optimistic version");
  const staleSave = await app.inject({
    method: "POST",
    url: "/admin/about",
    headers,
    payload: { title: "stale overwrite", markdown: "secret", version: initial.json().version },
  });
  assert.equal(staleSave.statusCode, 409);
  assert.deepEqual(staleSave.json(), { error: "stale_version" });
  const retained = await app.inject({ method: "GET", url: "/admin/about", headers: { cookie } });
  assert.equal(retained.json().title, "关于本站", "a stale writer cannot overwrite newer content");

  const stalePublish = await app.inject({ method: "POST", url: "/admin/about/publish", headers, payload: { version: initial.json().version } });
  assert.equal(stalePublish.statusCode, 409);
  const published = await app.inject({ method: "POST", url: "/admin/about/publish", headers, payload: { version: saved.json().version } });
  assert.equal(published.statusCode, 200, published.body);
  assert.equal(published.json().status, "published");
  const publicAbout = await app.inject({ method: "GET", url: "/public/about" });
  assert.equal(publicAbout.statusCode, 200, publicAbout.body);
  assert.deepEqual(Object.keys(publicAbout.json()).sort(), ["renderedHtml", "title", "updatedAt"]);
  assert.equal(publicAbout.json().title, "关于本站");
  assert.equal(publicAbout.json().renderedHtml, preview.json().html, "preview and public About share the server renderer");

  const returnedToDraft = await app.inject({
    method: "POST",
    url: "/admin/about",
    headers,
    payload: { title: "未发布的新版本", markdown: "# Draft", version: published.json().version },
  });
  assert.equal(returnedToDraft.statusCode, 200, returnedToDraft.body);
  assert.equal(returnedToDraft.json().status, "draft");
  assert.equal((await app.inject({ method: "GET", url: "/public/about" })).body, missingPublic.body, "unpublished About leaks no draft state");

  const emptyArchive = await app.inject({ method: "GET", url: "/public/archives" });
  assert.equal(emptyArchive.statusCode, 200);
  assert.deepEqual(emptyArchive.json(), { years: [] });
  const tiedAt = new Date("2025-12-31T16:30:00.000Z");
  await db.insert(articles).values([
    { id: "00000000-0000-4000-8000-000000000002", title: "Newer ID", summary: "", slug: "newer-id", markdown: "", status: "published", publishedAt: tiedAt },
    { id: "00000000-0000-4000-8000-000000000001", title: "Older ID", summary: "", slug: "older-id", markdown: "", status: "published", publishedAt: tiedAt },
    { id: "00000000-0000-4000-8000-000000000003", title: "Previous Shanghai year", summary: "", slug: "previous-year", markdown: "", status: "published", publishedAt: new Date("2025-12-31T15:30:00.000Z") },
    { title: "Hidden draft", summary: "", slug: "hidden-draft", markdown: "", status: "draft", publishedAt: null },
    { title: "Hidden unpublished", summary: "", slug: "hidden-unpublished", markdown: "", status: "unpublished", publishedAt: tiedAt },
    { title: "Hidden deleted", summary: "", slug: "hidden-deleted", markdown: "", status: "published", publishedAt: tiedAt, deletedAt: new Date() },
    { title: "Hidden null date", summary: "", slug: "hidden-null-date", markdown: "", status: "published", publishedAt: null },
  ]);
  const archive = await app.inject({ method: "GET", url: "/public/archives" });
  assert.equal(archive.statusCode, 200, archive.body);
  assert.deepEqual(archive.json(), {
    years: [
      { year: 2026, months: [{ month: 1, items: [
        { title: "Newer ID", slug: "newer-id", publishedAt: tiedAt.toISOString() },
        { title: "Older ID", slug: "older-id", publishedAt: tiedAt.toISOString() },
      ] }] },
      { year: 2025, months: [{ month: 12, items: [
        { title: "Previous Shanghai year", slug: "previous-year", publishedAt: "2025-12-31T15:30:00.000Z" },
      ] }] },
    ],
  });
});
