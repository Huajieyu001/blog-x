import { verify } from "@node-rs/argon2";
import { loginInputSchema, loginResponseSchema, logoutResponseSchema, sessionStatusSchema } from "@blog-x/contracts";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sessionCookieName, sessionCookieOptions, type SessionService } from "../auth/sessions.js";
import * as schema from "../db/schema.js";

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
  app.post("/auth/login", async (request, reply) => {
    noStore(reply);
    if (!trustedOrigin(request, options.publicOrigin)) return reply.code(403).send({ error: "forbidden" });
    const parsed = loginInputSchema.safeParse(request.body);
    if (!parsed.success) return unauthorized(reply);
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
    noStore(reply);
    if (!trustedOrigin(request, options.publicOrigin)) return reply.code(403).send({ error: "forbidden" });
    const token = request.cookies[sessionCookieName];
    if (!await options.sessionAuth.administratorIdForToken(token)) {
      reply.setCookie(sessionCookieName, "", { ...sessionCookieOptions(options.secureCookies), maxAge: 0 });
      return unauthorized(reply);
    }
    await options.sessionAuth.revoke(token);
    reply.setCookie(sessionCookieName, "", { ...sessionCookieOptions(options.secureCookies), maxAge: 0 });
    return logoutResponseSchema.parse({ ok: true });
  });
};
