import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createSessionService } from "../src/auth/sessions.js";
import { formatOperationalRetentionFailure, formatOperationalRetentionResult, parseOperationalRetentionArguments, runOperationalRetention } from "../src/content/operational-retention.js";
import { administrators, sessions } from "../src/db/schema.js";

const databaseUrl = process.env.OPERATIONAL_RETENTION_TEST_DATABASE_URL;

test("operational retention accepts exactly two bounded named limits and emits aggregate-only JSON", async () => {
  assert.deepEqual(parseOperationalRetentionArguments(["--views-limit=100", "--sessions-limit=200"]), { ok: true, viewsLimit: 100, sessionsLimit: 200 });
  assert.deepEqual(parseOperationalRetentionArguments(["--sessions-limit=200", "--views-limit=100"]), { ok: true, viewsLimit: 100, sessionsLimit: 200 });
  for (const arguments_ of [[], ["--views-limit=1"], ["--views-limit=0", "--sessions-limit=1"], ["--views-limit=1", "--sessions-limit=10001"], ["--views-limit=1", "--views-limit=2"], ["--views-limit=1", "--sessions-limit=2", "--extra=3"]]) {
    assert.deepEqual(parseOperationalRetentionArguments(arguments_), { ok: false, code: "invalid_arguments" });
  }

  const result = await runOperationalRetention({
    cleanupExpiredDailyViews: async (limit) => ({ retainedFromDay: "2025-08-31", deleted: limit - 97 }),
    cleanupExpiredSessions: async (limit) => ({ deleted: limit - 198, observedAt: new Date("2032-01-01T00:00:00.000Z"), revokedBefore: new Date("2031-12-18T00:00:00.000Z") }),
  }, { viewsLimit: 100, sessionsLimit: 200 });
  const serialized = formatOperationalRetentionResult(result);
  assert.deepEqual(JSON.parse(serialized), {
    format: "blog-x-operational-retention", version: 1, command: "retention", observedAt: "2032-01-01T00:00:00.000Z",
    views: { limit: 100, retainedFromDay: "2025-08-31", deleted: 3 },
    sessions: { limit: 200, deleted: 2, expiredBefore: "2032-01-01T00:00:00.000Z", revokedBefore: "2031-12-18T00:00:00.000Z" },
  });
  assert.doesNotMatch(serialized, /article|slug|cookie|session[_-]?token|postgres|password|database/i);
  assert.deepEqual(JSON.parse(formatOperationalRetentionFailure("cleanup_failed")), {
    format: "blog-x-operational-retention", version: 1, command: "retention", code: "cleanup_failed",
  });
});

test("session retention uses database time, bounded ordered batches, and converges under concurrency", async (context) => {
  if (!databaseUrl) {
    context.skip("OPERATIONAL_RETENTION_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, sessions } });
  await pool.query("truncate table sessions, administrators cascade");
  context.after(async () => { await pool.query("truncate table sessions, administrators cascade"); await pool.end(); });
  const administratorId = "00000000-0000-4000-8000-000000000171";
  await db.insert(administrators).values({ id: administratorId, username: `retention-${Date.now()}`, passwordHash: "not-a-secret" });
  await pool.query(`
    INSERT INTO sessions (administrator_id, token_digest, expires_at, revoked_at)
    VALUES
      ($1, 'expired-a', CURRENT_TIMESTAMP - interval '1 minute', NULL),
      ($1, 'expired-b', CURRENT_TIMESTAMP - interval '2 minute', NULL),
      ($1, 'old-revoked', CURRENT_TIMESTAMP + interval '1 day', CURRENT_TIMESTAMP - interval '15 days'),
      ($1, 'recent-revoked', CURRENT_TIMESTAMP + interval '1 day', CURRENT_TIMESTAMP - interval '13 days'),
      ($1, 'active', CURRENT_TIMESTAMP + interval '1 day', NULL)
  `, [administratorId]);
  const service = createSessionService(db);
  const concurrent = await Promise.all([service.cleanupExpiredSessions(2), service.cleanupExpiredSessions(2)]);
  assert.equal(concurrent.reduce((total, result) => total + result.deleted, 0), 3);
  const converged = await service.cleanupExpiredSessions(2);
  assert.equal(converged.deleted, 0);
  assert.ok(converged.observedAt instanceof Date);
  assert.equal(converged.observedAt.getTime() - converged.revokedBefore.getTime(), 14 * 24 * 60 * 60 * 1000);
  const retained = await pool.query<{ token_digest: string }>("select token_digest from sessions order by token_digest");
  assert.deepEqual(retained.rows.map((row) => row.token_digest), ["active", "recent-revoked"]);
});
