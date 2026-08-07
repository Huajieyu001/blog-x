import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Writable } from "node:stream";
import { verify } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, sessions } from "../src/db/schema.js";

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
  const db = drizzle({ client: pool });
  const migration = await readFile(new URL("../drizzle/0000_phase1_walking_skeleton.sql", import.meta.url), "utf8");
  const logs: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, callback) { logs.push(String(chunk)); callback(); } });
  const username = `auth-test-${Date.now()}`;
  const password = "credential-that-must-not-appear-in-logs";

  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
    await pool.query(statement).catch((error: { code?: string }) => {
      if (error.code !== "42P07") throw error;
    });
  }
  await pool.query("truncate table sessions, administrators cascade");
  context.after(async () => { await pool.end(); });

  await seedAdministrator(db, { username, password });
  await seedAdministrator(db, { username, password });
  const seeded = await db.select().from(administrators);
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0]?.username, username);
  assert.ok(seeded[0]?.passwordHash.startsWith("$argon2id$"));
  assert.equal(await verify(seeded[0]!.passwordHash, password), true);
  await assert.rejects(seedAdministrator(db, { username: `${username}-second`, password }), /second administrator/i);
  assert.equal((await db.select().from(administrators)).length, 1);

  const app = await buildApp({ logger: { level: "info", stream } });
  context.after(async () => { await app.close(); });
  const headers = { origin: publicOrigin, "content-type": "application/json" };
  const wrong = await app.inject({ method: "POST", url: "/auth/login", headers, payload: { username, password: "wrong-password" } });
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong.json(), { error: "unauthorized" });
  assert.equal(wrong.headers["cache-control"], "no-store");
  const rejectedOrigin = await app.inject({ method: "POST", url: "/auth/login", headers: { ...headers, origin: "https://untrusted.invalid" }, payload: { username, password } });
  assert.equal(rejectedOrigin.statusCode, 403);

  const firstLogin = await app.inject({ method: "POST", url: "/auth/login", headers, payload: { username, password } });
  assert.equal(firstLogin.statusCode, 200);
  assert.deepEqual(firstLogin.json(), { ok: true });
  const firstCookie = cookieValue(String(firstLogin.headers["set-cookie"]));
  assert.match(String(firstLogin.headers["set-cookie"]), /HttpOnly/i);
  assert.match(String(firstLogin.headers["set-cookie"]), /SameSite=Lax/i);
  assert.match(String(firstLogin.headers["set-cookie"]), /Path=\//i);
  assert.doesNotMatch(String(firstLogin.headers["set-cookie"]), /Domain=/i);

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
  const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: { origin: publicOrigin, cookie: `blog_x_session=${secondCookie}` } });
  assert.equal(logout.statusCode, 200);
  assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/i);
  const reused = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie: `blog_x_session=${secondCookie}` } });
  assert.equal(reused.statusCode, 401);

  const finalLogs = logs.join("");
  assert.doesNotMatch(finalLogs, new RegExp(password));
  assert.doesNotMatch(finalLogs, new RegExp(firstCookie));
  assert.doesNotMatch(finalLogs, new RegExp(secondCookie));
});
