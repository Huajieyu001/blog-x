import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendAuditEvent } from "../audit/audit-repository.js";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;

export const sessionCookieName = process.env.NODE_ENV === "production" ? "__Host-blog_x_session" : "blog_x_session";
export const sessionLifetimeSeconds = 60 * 60 * 24 * 14;

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

  return { administratorIdForToken, issue, revoke };
}

export type SessionService = ReturnType<typeof createSessionService>;
