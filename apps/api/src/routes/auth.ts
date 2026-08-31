import { verify } from "@node-rs/argon2";
import { loginInputSchema, loginResponseSchema, logoutResponseSchema, sessionStatusSchema } from "@blog-x/contracts";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sessionCookieName, sessionCookieOptions, type SessionService } from "../auth/sessions.js";
import * as schema from "../db/schema.js";
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
    // Fastify's socket-backed request.ip is authoritative because buildApp sets
    // trustProxy false; forwarded headers cannot alter this limiter key.
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
};
