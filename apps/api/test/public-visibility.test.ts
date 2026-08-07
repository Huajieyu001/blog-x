import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, articles, sessions } from "../src/db/schema.js";

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
