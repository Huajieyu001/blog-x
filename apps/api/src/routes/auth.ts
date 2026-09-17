import { Algorithm, hash, verify } from "@node-rs/argon2";
import { changePasswordInputSchema, changePasswordResponseSchema, loginInputSchema, loginResponseSchema, logoutResponseSchema, sessionStatusSchema } from "@blog-x/contracts";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sessionCookieName, sessionCookieOptions, type SessionService } from "../auth/sessions.js";
import * as schema from "../db/schema.js";
import { appendAuditEvent } from "../audit/audit-repository.js";
import { BoundedRateLimitStore, createRateLimitKey, type RateLimitPolicy } from "../security/rate-limiter.js";
import { requireAdministratorMutation, requireContentType, type MutationGuardOptions } from "../security/mutation-guard.js";

type Database = NodePgDatabase<typeof schema>;
declare module "fastify" {
  interface FastifyInstance {
    sessionAuth: SessionService;
  }
}

type AuthRouteOptions = {
  db: Database;
  sessionAuth: SessionService;
  publicOrigin?: string;
  secureCookies: boolean;
  loginRatePolicy: RateLimitPolicy;
  rateStore: BoundedRateLimitStore;
  mutationGuard: MutationGuardOptions;
};

function noStore(reply: { header: (name: string, value: string) => unknown }) {
  reply.header("cache-control", "no-store");
}

function unauthorized(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) {
  return reply.code(401).send({ error: "unauthorized" });
}

function trustedOrigin(request: FastifyRequest, publicOrigin: string | undefined) {
  return Boolean(publicOrigin) && request.headers.origin === publicOrigin;
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  app.post("/auth/login", { bodyLimit: 64 * 1024 }, async (request, reply) => {
    noStore(reply);
    if (!trustedOrigin(request, options.publicOrigin)) return reply.code(403).send({ error: "forbidden" });
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = loginInputSchema.safeParse(request.body);
    if (!parsed.success) return unauthorized(reply);
    // The API accepts X-Forwarded-For only from its exact configured Web proxy;
    // Web has already authenticated and canonicalized it at controlled ingress.
    const decision = options.rateStore.consume(
      createRateLimitKey("login", request.ip, parsed.data.username),
      options.loginRatePolicy,
    );
    if (!decision.allowed) {
      reply.header("retry-after", String(decision.retryAfterSeconds));
      return reply.code(429).send({ error: "too_many_requests" });
    }
    const administrator = await options.db.select().from(schema.administrators)
      .where(eq(schema.administrators.username, parsed.data.username))
      .limit(1);
    if (!administrator[0] || !(await verify(administrator[0].passwordHash, parsed.data.password))) return unauthorized(reply);
    const token = await options.sessionAuth.issue(administrator[0].id);
    reply.setCookie(sessionCookieName, token, sessionCookieOptions(options.secureCookies));
    return loginResponseSchema.parse({ ok: true });
  });

  app.get("/auth/session", async (request, reply) => {
    noStore(reply);
    if (!await options.sessionAuth.administratorIdForToken(request.cookies[sessionCookieName])) return unauthorized(reply);
    return sessionStatusSchema.parse({ authenticated: true });
  });

  app.post("/auth/logout", async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
    if (!administratorId) return;
    const token = request.cookies[sessionCookieName];
    await options.sessionAuth.revoke(token, administratorId);
    reply.setCookie(sessionCookieName, "", { ...sessionCookieOptions(options.secureCookies), maxAge: 0 });
    return logoutResponseSchema.parse({ ok: true });
  });

  app.post("/auth/password", { bodyLimit: 8 * 1024 }, async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
    if (!administratorId) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = changePasswordInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_password_change" });
    const replacementHash = await hash(parsed.data.newPassword, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const result = await options.db.transaction(async (tx) => {
      const rows = await tx.select().from(schema.administrators).where(eq(schema.administrators.id, administratorId)).for("update");
      const administrator = rows[0];
      if (!administrator || !(await verify(administrator.passwordHash, parsed.data.currentPassword))) return false;
      // Database time keeps every session revocation in the password-change
      // transaction on one authority, independent of the API host clock.
      const transactionNowRaw = (await tx.execute<{ transactionNow: Date | string }>(sql`select CURRENT_TIMESTAMP as "transactionNow"`)).rows[0]?.transactionNow;
      const now = transactionNowRaw instanceof Date ? transactionNowRaw : new Date(String(transactionNowRaw));
      if (Number.isNaN(now.getTime())) throw new Error("transaction timestamp is unavailable");
      await tx.update(schema.administrators).set({ passwordHash: replacementHash }).where(eq(schema.administrators.id, administratorId));
      await tx.update(schema.sessions).set({ revokedAt: now }).where(and(eq(schema.sessions.administratorId, administratorId), isNull(schema.sessions.revokedAt)));
      await appendAuditEvent(tx, { actorAdministratorId: administratorId, event: "auth.password.changed", targetType: "administrator", targetId: administratorId, metadata: { changedFields: ["password"] } });
      return true;
    });
    if (!result) return reply.code(400).send({ error: "invalid_current_password" });
    reply.setCookie(sessionCookieName, "", { ...sessionCookieOptions(options.secureCookies), maxAge: 0 });
    return changePasswordResponseSchema.parse({ ok: true });
  });
};
