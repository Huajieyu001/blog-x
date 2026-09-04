import type { FastifyReply, FastifyRequest } from "fastify";
import { sessionCookieName, type SessionService } from "../auth/sessions.js";
import { BoundedRateLimitStore, createRateLimitKey, type RateLimitPolicy } from "./rate-limiter.js";

export type MutationGuardOptions = {
  sessionAuth: SessionService;
  publicOrigin?: string;
  rateStore: BoundedRateLimitStore;
  ratePolicy: RateLimitPolicy;
};

export type UnsafeRoutePolicy = {
  method: "POST" | "PUT" | "DELETE";
  url: string;
  contentType: "json" | "empty-form" | "multipart" | "none";
  bodyLimit: number;
  limiter: "login" | "administrator";
  generalLimiter: true;
};

/** Every registered unsafe API route has a named body and limiter policy. */
export const unsafeRoutePolicies: readonly UnsafeRoutePolicy[] = [
  { method: "POST", url: "/auth/login", contentType: "json", bodyLimit: 64 * 1024, limiter: "login", generalLimiter: true },
  { method: "POST", url: "/auth/logout", contentType: "none", bodyLimit: 1, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/posts/preview", contentType: "json", bodyLimit: 256 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/posts", contentType: "json", bodyLimit: 256 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "PUT", url: "/admin/posts/:id", contentType: "json", bodyLimit: 256 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "PUT", url: "/admin/posts/:id/schedule", contentType: "json", bodyLimit: 4 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "DELETE", url: "/admin/posts/:id/schedule", contentType: "none", bodyLimit: 1, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/posts/:id/schedule", contentType: "empty-form", bodyLimit: 4 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/posts/:id/schedule/cancel", contentType: "empty-form", bodyLimit: 1, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/posts/:id/:action", contentType: "json", bodyLimit: 64 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/export", contentType: "empty-form", bodyLimit: 1024, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/categories", contentType: "json", bodyLimit: 16 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/tags", contentType: "json", bodyLimit: 16 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "PUT", url: "/admin/:kind(categories|tags)/:id", contentType: "json", bodyLimit: 16 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "DELETE", url: "/admin/:kind(categories|tags)/:id", contentType: "none", bodyLimit: 1, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/about", contentType: "json", bodyLimit: 256 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/about/preview", contentType: "json", bodyLimit: 256 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/about/publish", contentType: "json", bodyLimit: 64 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/admin/media", contentType: "multipart", bodyLimit: 5 * 1024 * 1024 + 64 * 1024, limiter: "administrator", generalLimiter: true },
  { method: "POST", url: "/articles/publish", contentType: "json", bodyLimit: 256 * 1024, limiter: "administrator", generalLimiter: true },
];

function noStore(reply: FastifyReply) {
  reply.header("cache-control", "no-store");
}

export async function requireAdministrator(request: FastifyRequest, reply: FastifyReply, options: Pick<MutationGuardOptions, "sessionAuth">) {
  noStore(reply);
  const administratorId = await options.sessionAuth.administratorIdForToken(request.cookies[sessionCookieName]);
  if (!administratorId) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  return administratorId;
}

/** Session authority is intentionally evaluated before Origin and rate policy. */
export async function requireAdministratorMutation(request: FastifyRequest, reply: FastifyReply, options: MutationGuardOptions) {
  const administratorId = await requireAdministrator(request, reply, options);
  if (!administratorId) return null;
  if (!options.publicOrigin || request.headers.origin !== options.publicOrigin) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  const decision = options.rateStore.consume(
    createRateLimitKey("administrator-mutation", request.ip, administratorId),
    options.ratePolicy,
  );
  if (!decision.allowed) {
    reply.header("retry-after", String(decision.retryAfterSeconds));
    reply.code(429).send({ error: "too_many_requests" });
    return null;
  }
  return administratorId;
}

export function requireContentType(request: FastifyRequest, reply: FastifyReply, expected: "application/json" | "application/x-www-form-urlencoded" | "multipart/form-data") {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.toLowerCase();
  if (contentType === expected) return true;
  reply.code(415).send({ error: "unsupported_media_type" });
  return false;
}

/** A native empty form may omit its Content-Type; any supplied body must be form encoded. */
export function requireEmptyFormContent(request: FastifyRequest, reply: FastifyReply) {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.toLowerCase();
  if (contentType === undefined && request.body === undefined) return true;
  return requireContentType(request, reply, "application/x-www-form-urlencoded");
}
