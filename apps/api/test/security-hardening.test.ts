import assert from "node:assert/strict";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyPluginAsync } from "fastify";
import { aboutInputSchema, adminPostInputSchema, taxonomyInputSchema } from "@blog-x/contracts";
import { closeRuntimeResourcesOnAppClose } from "../src/app.js";
import { authRoutes } from "../src/routes/auth.js";
import { parseApiRuntimeConfig } from "../src/security/config.js";
import { requireAdministratorMutation, unsafeRoutePolicies } from "../src/security/mutation-guard.js";
import { BoundedRateLimitStore, createRateLimitKey, type Clock } from "../src/security/rate-limiter.js";

class ManualClock implements Clock {
  constructor(private value = 0) {}
  now() { return this.value; }
  advance(milliseconds: number) { this.value += milliseconds; }
}

test("serving resources remain open until the Fastify application closes", async () => {
  const app = Fastify();
  let closeCount = 0;
  closeRuntimeResourcesOnAppClose(app, {
    pool: { end: async () => { closeCount += 1; } } as never,
  });
  await app.ready();
  assert.equal(closeCount, 0, "startup must not close the serving database pool");
  await app.close();
  assert.equal(closeCount, 1, "application shutdown owns database pool cleanup");
  await app.close();
  assert.equal(closeCount, 1, "cleanup remains idempotent");
});

test("runtime configuration rejects unsafe production input before resources can be created", () => {
  const base = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://database.example/blog",
    PUBLIC_ORIGIN: "https://blog.example",
    API_HOST: "127.0.0.1",
    API_PORT: "3001",
    MEDIA_ROOT: "/var/lib/blog-x/media",
  };
  assert.throws(() => parseApiRuntimeConfig({ ...base, PUBLIC_ORIGIN: "http://blog.example" }, "serve"), /PUBLIC_ORIGIN/);
  assert.throws(() => parseApiRuntimeConfig({ ...base, DATABASE_URL: undefined }, "serve"), /DATABASE_URL/);
  assert.throws(() => parseApiRuntimeConfig({ ...base, BLOG_X_LOGIN_LIMIT: "0" }, "serve"), /BLOG_X_LOGIN_LIMIT/);
  assert.throws(() => parseApiRuntimeConfig(base, "seed"), /ADMIN_USERNAME/);
});

test("serve configuration defaults to an internal-container-reachable API listener without publishing a host port", () => {
  const config = parseApiRuntimeConfig({
    NODE_ENV: "development",
    DATABASE_URL: "postgres://database.example/blog",
    PUBLIC_ORIGIN: "http://127.0.0.1:3100",
    MEDIA_ROOT: "/var/lib/blog-x/media",
  }, "serve");
  assert.equal(config.apiHost, "0.0.0.0");
  assert.equal(config.apiPort, 3001);
});

test("single-process login limiter normalizes keys, recovers exactly at its boundary, and is bounded", () => {
  const clock = new ManualClock();
  const store = new BoundedRateLimitStore(clock, 2);
  const policy = { limit: 2, windowMs: 60_000 };
  const key = createRateLimitKey("login", "127.0.0.1", "  ADMIN\uFF21  ");
  assert.equal(key, createRateLimitKey("login", "127.0.0.1", "admina"));
  assert.deepEqual(store.consume(key, policy), { allowed: true });
  assert.deepEqual(store.consume(key, policy), { allowed: true });
  assert.deepEqual(store.consume(key, policy), { allowed: false, retryAfterSeconds: 60 });
  clock.advance(60_000);
  assert.deepEqual(store.consume(key, policy), { allowed: true });
  assert.deepEqual(store.consume(createRateLimitKey("login", "127.0.0.2", "other"), policy), { allowed: true });
  assert.equal(store.size(), 2);
  assert.deepEqual(store.consume(createRateLimitKey("login", "127.0.0.3", "full"), policy), { allowed: false, retryAfterSeconds: 60 });
});

test("five generic failed logins are followed by a no-store bounded retry response before lookup", async (context) => {
  const clock = new ManualClock();
  const app = Fastify({ trustProxy: false });
  let lookups = 0;
  await app.register(cookie as unknown as FastifyPluginAsync);
  await app.register(authRoutes, {
    db: {
      select: () => {
        lookups += 1;
        return { from: () => ({ where: () => ({ limit: async () => [] }) }) };
      },
    } as never,
    sessionAuth: { administratorIdForToken: async () => null, issue: async () => "", revoke: async () => undefined },
    publicOrigin: "http://127.0.0.1:3100",
    secureCookies: false,
    loginRatePolicy: { limit: 5, windowMs: 60_000 },
    rateStore: new BoundedRateLimitStore(clock, 4_096),
    mutationGuard: {
      sessionAuth: { administratorIdForToken: async () => null, issue: async () => "", revoke: async () => undefined },
      publicOrigin: "http://127.0.0.1:3100",
      rateStore: new BoundedRateLimitStore(clock, 4_096),
      ratePolicy: { limit: 1, windowMs: 60_000 },
    },
  });
  context.after(() => app.close());
  const headers = { origin: "http://127.0.0.1:3100", "content-type": "application/json", "x-forwarded-for": "198.51.100.7" };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await app.inject({ method: "POST", url: "/auth/login", headers, payload: { username: " Admin ", password: "wrong" } });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "unauthorized" });
  }
  const limited = await app.inject({ method: "POST", url: "/auth/login", headers, payload: { username: "admin", password: "wrong" } });
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.json(), { error: "too_many_requests" });
  assert.equal(limited.headers["cache-control"], "no-store");
  assert.equal(limited.headers["retry-after"], "60");
  assert.equal(lookups, 5, "the exhausted request must not reach credential lookup");
  clock.advance(60_000);
  const recovered = await app.inject({ method: "POST", url: "/auth/login", headers, payload: { username: "ADMIN", password: "wrong" } });
  assert.equal(recovered.statusCode, 401);
});

test("auth logout and legacy publish have named unsafe route policies", () => {
  const named = unsafeRoutePolicies.map((policy) => `${policy.method} ${policy.url}`);
  assert.deepEqual(named, [
    "POST /auth/login",
    "POST /auth/logout",
    "POST /admin/posts/preview",
    "POST /admin/posts",
    "PUT /admin/posts/:id",
    "POST /admin/posts/:id/:action",
    "POST /admin/export",
    "POST /admin/categories",
    "POST /admin/tags",
    "PUT /admin/:kind(categories|tags)/:id",
    "DELETE /admin/:kind(categories|tags)/:id",
    "POST /admin/about",
    "POST /admin/about/preview",
    "POST /admin/about/publish",
    "POST /admin/media",
    "POST /articles/publish",
  ]);
  for (const policy of unsafeRoutePolicies) {
    assert.ok(["login", "administrator"].includes(policy.limiter));
    assert.ok(["json", "empty-form", "multipart", "none"].includes(policy.contentType));
    assert.ok(policy.bodyLimit > 0);
  }
});

test("admin posts and export mutation policy is session-first, Origin-second, and service-free on rejection", async (context) => {
  const clock = new ManualClock();
  const app = Fastify({ trustProxy: false });
  let calls = 0;
  const rateStore = new BoundedRateLimitStore(clock, 4_096);
  await app.register(cookie as unknown as FastifyPluginAsync);
  app.post("/mutation", async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, {
      sessionAuth: { administratorIdForToken: async (token) => token === "valid" ? "administrator-id" : null, issue: async () => "", revoke: async () => undefined },
      publicOrigin: "http://127.0.0.1:3100",
      rateStore,
      ratePolicy: { limit: 1, windowMs: 60_000 },
    });
    if (!administratorId) return;
    calls += 1;
    return { ok: true };
  });
  context.after(() => app.close());
  const wrongOrigin = await app.inject({ method: "POST", url: "/mutation", headers: { origin: "https://wrong.invalid" } });
  assert.equal(wrongOrigin.statusCode, 401);
  assert.equal(wrongOrigin.headers["cache-control"], "no-store");
  assert.equal(calls, 0);
  const forbidden = await app.inject({ method: "POST", url: "/mutation", headers: { cookie: "blog_x_session=valid", origin: "https://wrong.invalid" } });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(calls, 0);
  const allowed = await app.inject({ method: "POST", url: "/mutation", headers: { cookie: "blog_x_session=valid", origin: "http://127.0.0.1:3100" } });
  assert.equal(allowed.statusCode, 200);
  const limited = await app.inject({ method: "POST", url: "/mutation", headers: { cookie: "blog_x_session=valid", origin: "http://127.0.0.1:3100" } });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["cache-control"], "no-store");
  assert.equal(limited.headers["retry-after"], "60");
  assert.equal(calls, 1);
});

test("taxonomy pages and media policy inventory has no unclassified unsafe route", () => {
  assert.equal(unsafeRoutePolicies.filter((policy) => !policy.contentType || !policy.limiter).length, 0);
});

test("SQL-shaped Unicode content remains literal strict input rather than executable authority", () => {
  const shaped = "ＯＲ 1=1; -- 𝒖𝒏𝒊𝒄𝒐𝒅𝒆";
  const article = adminPostInputSchema.safeParse({ title: shaped, summary: shaped, coverUrl: "", slug: "sql-shaped", markdown: shaped, publishedAt: null, seoDescription: shaped });
  const taxonomy = taxonomyInputSchema.safeParse({ name: shaped, slug: "sql-shaped" });
  const about = aboutInputSchema.safeParse({ title: shaped, markdown: shaped, version: null });
  assert.equal(article.success, true);
  assert.equal(taxonomy.success, true);
  assert.equal(about.success, true);
  if (article.success) assert.equal(article.data.markdown, shaped);
  if (taxonomy.success) assert.equal(taxonomy.data.name, shaped);
  if (about.success) assert.equal(about.data.markdown, shaped);
});
