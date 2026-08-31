import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Writable } from "node:stream";
import { verify } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, articles, sessions } from "../src/db/schema.js";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const publicOrigin = "http://127.0.0.1:3100";

function cookieValue(setCookie: string) {
  const match = /^blog_x_session=([^;]+)/.exec(setCookie);
  assert.ok(match, "login must issue the development session cookie");
  return match[1];
}

test("single administrator sessions are opaque, rotated, revocable, and do not leak to logs", async (context) => {
  if (!databaseUrl) {
    context.skip("AUTH_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, sessions } });
  const logs: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, callback) { logs.push(String(chunk)); callback(); } });
  const username = `auth-test-${Date.now()}`;
  const password = "credential-that-must-not-appear-in-logs";

  await pool.query("truncate table audit_events, sessions, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table audit_events, sessions, administrators cascade");
    await pool.end();
  });

  await seedAdministrator(db, { username, password });
  await seedAdministrator(db, { username, password });
  const seeded = await db.select().from(administrators);
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0]?.username, username);
  assert.ok(seeded[0]?.passwordHash.startsWith("$argon2id$"));
  assert.equal(await verify(seeded[0]!.passwordHash, password), true);
  await assert.rejects(seedAdministrator(db, { username: `${username}-second`, password }), /second administrator/i);
  assert.equal((await db.select().from(administrators)).length, 1);

  const app = await buildApp({ logger: { level: "info", stream }, publicOrigin });
  context.after(async () => { await app.close(); });
  const headers = { origin: publicOrigin, "content-type": "application/json" };
  const wrong = await app.inject({ method: "POST", url: "/auth/login", headers, payload: { username, password: "wrong-password" } });
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong.json(), { error: "unauthorized" });
  assert.equal(wrong.headers["cache-control"], "no-store");
  assert.equal((await pool.query("select count(*)::int as count from audit_events")).rows[0].count, 0);
  const rejectedOrigin = await app.inject({ method: "POST", url: "/auth/login", headers: { ...headers, origin: "https://untrusted.invalid" }, payload: { username, password } });
  assert.equal(rejectedOrigin.statusCode, 403);
  assert.equal((await pool.query("select count(*)::int as count from audit_events")).rows[0].count, 0);

  await pool.query("create function blog_x_test_reject_audit() returns trigger language plpgsql as $$ begin raise exception 'forced audit failure'; end $$");
  await pool.query("create trigger blog_x_test_reject_audit before insert on audit_events for each row execute function blog_x_test_reject_audit()");
  let rejectedAuditWrite;
  try {
    rejectedAuditWrite = await app.inject({ method: "POST", url: "/auth/login", headers, payload: { username, password } });
  } finally {
    await pool.query("drop trigger if exists blog_x_test_reject_audit on audit_events");
    await pool.query("drop function if exists blog_x_test_reject_audit()");
  }
  assert.ok(rejectedAuditWrite);
  assert.equal(rejectedAuditWrite.statusCode, 500);
  assert.equal((await pool.query("select count(*)::int as count from sessions")).rows[0].count, 0, "session issuance rolls back when audit append fails");
  assert.equal((await pool.query("select count(*)::int as count from audit_events")).rows[0].count, 0);

  const firstLogin = await app.inject({ method: "POST", url: "/auth/login", headers, payload: { username, password } });
  assert.equal(firstLogin.statusCode, 200);
  assert.deepEqual(firstLogin.json(), { ok: true });
  const firstCookie = cookieValue(String(firstLogin.headers["set-cookie"]));
  assert.match(String(firstLogin.headers["set-cookie"]), /HttpOnly/i);
  assert.match(String(firstLogin.headers["set-cookie"]), /SameSite=Lax/i);
  assert.match(String(firstLogin.headers["set-cookie"]), /Path=\//i);
  assert.doesNotMatch(String(firstLogin.headers["set-cookie"]), /Domain=/i);

  const httpsOrigin = "https://blog.example.test";
  const httpsApp = await buildApp({ publicOrigin: httpsOrigin });
  context.after(async () => { await httpsApp.close(); });
  const secureLogin = await httpsApp.inject({ method: "POST", url: "/auth/login", headers: { origin: httpsOrigin, "content-type": "application/json" }, payload: { username, password } });
  assert.equal(secureLogin.statusCode, 200);
  assert.match(String(secureLogin.headers["set-cookie"]), /Secure/i);

  const secondLogin = await app.inject({ method: "POST", url: "/auth/login", headers: { ...headers, cookie: `blog_x_session=${firstCookie}` }, payload: { username, password } });
  assert.equal(secondLogin.statusCode, 200);
  const secondCookie = cookieValue(String(secondLogin.headers["set-cookie"]));
  assert.notEqual(secondCookie, firstCookie);
  const active = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie: `blog_x_session=${secondCookie}` } });
  assert.equal(active.statusCode, 200);
  assert.deepEqual(active.json(), { authenticated: true });
  assert.equal(active.headers["cache-control"], "no-store");
  const oldToken = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie: `blog_x_session=${firstCookie}` } });
  assert.equal(oldToken.statusCode, 401);
  assert.deepEqual(oldToken.json(), { error: "unauthorized" });

  const stored = await db.select().from(sessions);
  assert.equal(stored.some((session) => session.tokenDigest === createHash("sha256").update(secondCookie).digest("hex")), true);
  assert.equal(stored.some((session) => session.tokenDigest === secondCookie), false);
  await pool.query("update sessions set expires_at = now() - interval '1 second' where token_digest = $1", [createHash("sha256").update(secondCookie).digest("hex")]);
  const expired = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie: `blog_x_session=${secondCookie}` } });
  assert.equal(expired.statusCode, 401);
  assert.deepEqual(expired.json(), { error: "unauthorized" });

  const thirdLogin = await app.inject({ method: "POST", url: "/auth/login", headers, payload: { username, password } });
  assert.equal(thirdLogin.statusCode, 200);
  const thirdCookie = cookieValue(String(thirdLogin.headers["set-cookie"]));
  const deniedAudit = await app.inject({ method: "GET", url: "/admin/audit-events" });
  assert.equal(deniedAudit.statusCode, 401);
  assert.equal(deniedAudit.headers["cache-control"], "no-store");
  const firstAuditPage = await app.inject({ method: "GET", url: "/admin/audit-events?limit=2", headers: { cookie: `blog_x_session=${thirdCookie}` } });
  assert.equal(firstAuditPage.statusCode, 200, firstAuditPage.body);
  assert.equal(firstAuditPage.headers["cache-control"], "no-store");
  assert.equal(firstAuditPage.json().items.length, 2);
  assert.match(firstAuditPage.json().nextCursor, /^[A-Za-z0-9_-]+$/);
  const secondAuditPage = await app.inject({ method: "GET", url: `/admin/audit-events?limit=2&cursor=${encodeURIComponent(firstAuditPage.json().nextCursor)}`, headers: { cookie: `blog_x_session=${thirdCookie}` } });
  assert.equal(secondAuditPage.statusCode, 200, secondAuditPage.body);
  assert.equal(secondAuditPage.json().items.length, 2);
  assert.equal(new Set([...firstAuditPage.json().items, ...secondAuditPage.json().items].map((event: { id: string }) => event.id)).size, 4);
  const invalidAuditCursor = await app.inject({ method: "GET", url: "/admin/audit-events?cursor=not-a-valid-cursor", headers: { cookie: `blog_x_session=${thirdCookie}` } });
  assert.equal(invalidAuditCursor.statusCode, 400);
  const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: { origin: publicOrigin, cookie: `blog_x_session=${thirdCookie}` } });
  assert.equal(logout.statusCode, 200);
  assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/i);
  const reused = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie: `blog_x_session=${thirdCookie}` } });
  assert.equal(reused.statusCode, 401);

  const audit = await pool.query<{ event: string; actor_administrator_id: string; target_type: string; target_id: string; metadata: unknown }>(
    "select event, actor_administrator_id, target_type, target_id, metadata from audit_events order by occurred_at, id",
  );
  assert.deepEqual(Object.fromEntries(
    [...new Set(audit.rows.map((row) => row.event))].map((event) => [event, audit.rows.filter((row) => row.event === event).length]),
  ), { "auth.login.succeeded": 4, "auth.logout.succeeded": 1 });
  for (const event of audit.rows) {
    assert.equal(event.actor_administrator_id, seeded[0]!.id);
    assert.equal(event.target_type, "administrator");
    assert.equal(event.target_id, seeded[0]!.id);
    assert.deepEqual(event.metadata, {});
  }

  const finalLogs = logs.join("");
  assert.doesNotMatch(finalLogs, new RegExp(password));
  assert.doesNotMatch(finalLogs, new RegExp(firstCookie));
  assert.doesNotMatch(finalLogs, new RegExp(secondCookie));
  assert.doesNotMatch(finalLogs, new RegExp(thirdCookie));
});
