import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
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
    await db.update(schema.sessions).set({ revokedAt: now })
      .where(and(eq(schema.sessions.administratorId, administratorId), isNull(schema.sessions.revokedAt)));
    const token = randomBytes(32).toString("base64url");
    await db.insert(schema.sessions).values({
      administratorId,
      tokenDigest: digest(token),
      expiresAt: new Date(now.getTime() + sessionLifetimeSeconds * 1000),
    });
    return token;
  }

  async function revoke(token: string | undefined) {
    if (!token) return;
    await db.update(schema.sessions).set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.tokenDigest, digest(token)), isNull(schema.sessions.revokedAt)));
  }

  return { administratorIdForToken, issue, revoke };
}

export type SessionService = ReturnType<typeof createSessionService>;
