import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, siteSettings } from "../src/db/schema.js";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const origin = "http://127.0.0.1:3100";

function sessionCookie(value: string) {
  const match = /^blog_x_session=([^;]+)/.exec(value);
  assert.ok(match);
  return `blog_x_session=${match[1]}`;
}

test("site settings preserve the fixed ICP default, authenticate mutations, audit changes, and reject stale writers", async (context) => {
  if (!databaseUrl) { context.skip("AUTH_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database"); return; }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, siteSettings } });
  await pool.query("truncate table audit_events, sessions, site_settings, administrators cascade");
  context.after(async () => { await pool.query("truncate table audit_events, sessions, site_settings, administrators cascade"); await pool.end(); });
  const username = `settings-${Date.now()}`;
  const password = "site-settings-password";
  await seedAdministrator(db, { username, password });
  const app = await buildApp({ publicOrigin: origin });
  context.after(async () => { await app.close(); });

  const defaultPublic = await app.inject({ method: "GET", url: "/public/site-settings" });
  assert.equal(defaultPublic.statusCode, 200);
  assert.deepEqual(defaultPublic.json(), { name: "Blog X", description: "记录代码、系统与长期实践。", publicInfo: "", registrationNumber: "黔ICP备2023015906号", registrationUrl: "https://beian.miit.gov.cn/" });
  assert.equal((await app.inject({ method: "GET", url: "/admin/site-settings" })).statusCode, 401);
  const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin }, payload: { username, password } });
  const headers = { origin, cookie: sessionCookie(String(login.headers["set-cookie"])), "content-type": "application/json" };
  const blocked = await app.inject({ method: "POST", url: "/admin/site-settings", headers: { ...headers, origin: "https://wrong.invalid" }, payload: { name: "Wrong", description: "", publicInfo: "", version: null } });
  assert.equal(blocked.statusCode, 403);
  const saved = await app.inject({ method: "POST", url: "/admin/site-settings", headers, payload: { name: "我的博客", description: "可靠的公开阅读", publicInfo: "长期维护", version: null } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().registrationNumber, "黔ICP备2023015906号");
  assert.equal(saved.json().registrationUrl, "https://beian.miit.gov.cn/");
  const stale = await app.inject({ method: "POST", url: "/admin/site-settings", headers, payload: { name: "stale", description: "", publicInfo: "", version: null } });
  assert.equal(stale.statusCode, 409);
  const injectedRegistration = await app.inject({ method: "POST", url: "/admin/site-settings", headers, payload: { name: "我的博客", description: "可靠的公开阅读", publicInfo: "长期维护", version: saved.json().version, registrationNumber: "remove-me" } });
  assert.equal(injectedRegistration.statusCode, 400);
  const audit = await pool.query<{ event: string; target_type: string; metadata: Record<string, unknown> }>("select event, target_type, metadata from audit_events where event = 'site_settings.updated'");
  assert.deepEqual(audit.rows, [{ event: "site_settings.updated", target_type: "site_settings", metadata: { changedFields: ["name", "description", "publicInfo"] } }]);
  assert.equal(JSON.stringify(audit.rows).includes("我的博客"), false);
  await assert.rejects(pool.query("insert into site_settings (singleton, name, registration_number) values (false, 'unsafe', '')"), (error: unknown) => (error as { code?: string }).code === "23514");
});
