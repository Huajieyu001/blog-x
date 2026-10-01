import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const publicCacheControl = "public, max-age=30";
const noStoreCacheControl = "no-store";
const immutableMediaCacheControl = "public, max-age=31536000, immutable";

function requestPathname(request: FastifyRequest) {
  return request.url.split("?", 1)[0] ?? request.url;
}

function hasCredential(request: FastifyRequest) {
  return request.headers.cookie !== undefined || request.headers.authorization !== undefined;
}

function hasSetCookie(reply: FastifyReply) {
  return reply.getHeader("set-cookie") !== undefined;
}

function hasExplicitPrivatePolicy(value: unknown) {
  return typeof value === "string" && /(?:^|,)\s*(?:private|no-store)(?:\s|,|$)/i.test(value);
}

function hasImmutableMediaPolicy(value: unknown) {
  return value === immutableMediaCacheControl;
}

function allowsPublicCache(request: FastifyRequest, reply: FastifyReply) {
  if (request.method !== "GET" || hasCredential(request) || hasSetCookie(reply)) return false;
  const path = requestPathname(request);
  if (!path.startsWith("/public/")) return false;
  return (reply.statusCode >= 200 && reply.statusCode < 300)
    || (reply.statusCode === 308 && /^\/public\/articles\/[A-Za-z0-9][A-Za-z0-9-]*$/.test(path));
}

/**
 * Shared-cache policy for API responses. It fails closed: any response outside
 * a successful anonymous public GET is explicitly no-store.
 */
export function registerResponseCacheControl(app: FastifyInstance) {
  app.addHook("onSend", async (request, reply, payload) => {
    const current = reply.getHeader("cache-control");
    if (hasImmutableMediaPolicy(current) || hasExplicitPrivatePolicy(current)) return payload;
    reply.header("cache-control", allowsPublicCache(request, reply) ? publicCacheControl : noStoreCacheControl);
    return payload;
  });
}
