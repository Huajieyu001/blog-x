import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendAuditEvent } from "../audit/audit-repository.js";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;

export const sessionCookieName = process.env.NODE_ENV === "production" ? "__Host-blog_x_session" : "blog_x_session";
export const sessionLifetimeSeconds = 60 * 60 * 24 * 14;
export const revokedSessionRetentionDays = 14;

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: sessionLifetimeSeconds,
  };
}

export function createSessionService(db: Database) {
  async function administratorIdForToken(token: string | undefined) {
    if (!token) return null;
    const active = await db.select({ administratorId: schema.sessions.administratorId })
      .from(schema.sessions)
      .where(and(
        eq(schema.sessions.tokenDigest, digest(token)),
        isNull(schema.sessions.revokedAt),
        gt(schema.sessions.expiresAt, new Date()),
      ))
      .limit(1);
    return active[0]?.administratorId ?? null;
  }

  async function issue(administratorId: string) {
    const now = new Date();
    const token = randomBytes(32).toString("base64url");
    await db.transaction(async (tx) => {
      await tx.update(schema.sessions).set({ revokedAt: now })
        .where(and(eq(schema.sessions.administratorId, administratorId), isNull(schema.sessions.revokedAt)));
      await tx.insert(schema.sessions).values({
        administratorId,
        tokenDigest: digest(token),
        expiresAt: new Date(now.getTime() + sessionLifetimeSeconds * 1000),
      });
      await appendAuditEvent(tx, {
        actorAdministratorId: administratorId,
        event: "auth.login.succeeded",
        targetType: "administrator",
        targetId: administratorId,
      });
    });
    return token;
  }

  async function revoke(token: string | undefined, administratorId: string) {
    if (!token) throw new Error("authenticated session token is missing");
    await db.transaction(async (tx) => {
      await tx.update(schema.sessions).set({ revokedAt: new Date() })
        .where(and(
          eq(schema.sessions.tokenDigest, digest(token)),
          eq(schema.sessions.administratorId, administratorId),
          isNull(schema.sessions.revokedAt),
        ));
      await appendAuditEvent(tx, {
        actorAdministratorId: administratorId,
        event: "auth.logout.succeeded",
        targetType: "administrator",
        targetId: administratorId,
      });
    });
  }

  async function cleanupExpiredSessions(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) throw new Error("invalid cleanup limit");
    const result = await db.execute(sql`
      WITH cutoff AS (
        SELECT CURRENT_TIMESTAMP AS observed_at,
          CURRENT_TIMESTAMP - INTERVAL '14 days' AS revoked_before
      ), candidates AS (
        SELECT session."id"
        FROM "sessions" AS session
        CROSS JOIN cutoff
        WHERE session."expires_at" <= cutoff.observed_at
          OR (session."revoked_at" IS NOT NULL AND session."revoked_at" < cutoff.revoked_before)
        ORDER BY session."id"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      ), deleted AS (
        DELETE FROM "sessions" AS session
        USING candidates
        WHERE session."id" = candidates."id"
        RETURNING 1
      )
      SELECT
        (SELECT count(*)::int FROM deleted) AS "deleted",
        floor(EXTRACT(EPOCH FROM cutoff.observed_at) * 1000)::float8 AS "observedAtEpochMs",
        floor(EXTRACT(EPOCH FROM cutoff.revoked_before) * 1000)::float8 AS "revokedBeforeEpochMs"
      FROM cutoff
    `);
    const row = result.rows[0] as {
      deleted?: unknown;
      observedAtEpochMs?: unknown;
      revokedBeforeEpochMs?: unknown;
    } | undefined;
    if (
      result.rows.length !== 1
      || !row
      || !Number.isSafeInteger(row.deleted)
      || (row.deleted as number) < 0
      || (row.deleted as number) > limit
      || !Number.isSafeInteger(row.observedAtEpochMs)
      || !Number.isSafeInteger(row.revokedBeforeEpochMs)
    ) {
      throw new Error("session cleanup result malformed");
    }
    const observedAt = new Date(row.observedAtEpochMs as number);
    const revokedBefore = new Date(row.revokedBeforeEpochMs as number);
    if (
      Number.isNaN(observedAt.getTime())
      || Number.isNaN(revokedBefore.getTime())
      || observedAt.getTime() - revokedBefore.getTime() !== revokedSessionRetentionDays * 24 * 60 * 60 * 1000
    ) {
      throw new Error("session cleanup result malformed");
    }
    return { deleted: row.deleted as number, observedAt, revokedBefore };
  }

  return { administratorIdForToken, issue, revoke, cleanupExpiredSessions };
}

export type SessionService = ReturnType<typeof createSessionService>;
