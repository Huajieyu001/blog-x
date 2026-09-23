import assert from "node:assert/strict";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyPluginAsync } from "fastify";
import { aboutInputSchema, adminPostInputSchema, taxonomyInputSchema } from "@blog-x/contracts";
import { closeRuntimeResourcesOnAppClose, migrationFingerprint, pendingMigrationIndex } from "../src/app.js";
import { authRoutes } from "../src/routes/auth.js";
import { mediaRoutes } from "../src/routes/media.js";
import { InvalidMediaError } from "../src/media/processor.js";
import { parseApiRuntimeConfig } from "../src/security/config.js";
import { requireAdministratorMutation, unsafeRoutePolicies } from "../src/security/mutation-guard.js";
import { BoundedRateLimitStore, createRateLimitKey, type Clock } from "../src/security/rate-limiter.js";
import { appendAuditEvent } from "../src/audit/audit-repository.js";

class ManualClock implements Clock {
  constructor(private value = 0) {}
  now() { return this.value; }
  advance(milliseconds: number) { this.value += milliseconds; }
}

function multipartUpload() {
  const boundary = "blog-x-security-hardening";
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\nnot-a-real-image\r\n--${boundary}--\r\n`);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

test("migration ledger advances only from an exact append-only history prefix", () => {
  const migrations = [
    { file: "0000_first.sql", sql: "select 1" },
    { file: "0001_second.sql", sql: "select 2" },
  ];
  assert.equal(pendingMigrationIndex(migrations), 0);
  assert.equal(pendingMigrationIndex(migrations, {
    migrationCount: 1,
    migrationFingerprint: migrationFingerprint(migrations.slice(0, 1)),
  }), 1);
  assert.equal(pendingMigrationIndex(migrations, {
    migrationCount: 2,
    migrationFingerprint: migrationFingerprint(migrations),
  }), 2);
  assert.throws(() => pendingMigrationIndex(migrations, { migrationCount: 3, migrationFingerprint: "0".repeat(64) }), /count/);
  assert.throws(() => pendingMigrationIndex(migrations, { migrationCount: 1, migrationFingerprint: "0".repeat(64) }), /prefix/);
});

test("media deletion audit evidence is content-free and has only a media target", async () => {
  const inserted: unknown[] = [];
  const executor = { insert: () => ({ values: async (value: unknown) => { inserted.push(value); } }) } as never;
  const actor = "00000000-0000-4000-8000-000000000001";
  const target = "00000000-0000-4000-8000-000000000002";
  await appendAuditEvent(executor, { actorAdministratorId: actor, event: "media.deleted", targetType: "media", targetId: target, metadata: {} });
  assert.equal(inserted.length, 1);
  await assert.rejects(appendAuditEvent(executor, { actorAdministratorId: actor, event: "media.deleted", targetType: "media", targetId: target, metadata: { changedFields: ["markdown"] } }), /metadata/);
  await assert.rejects(appendAuditEvent(executor, { actorAdministratorId: actor, event: "media.deleted", targetType: "article", targetId: target, metadata: {} }), /target/);
});

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
    TRUSTED_PROXY_CIDRS: "172.30.0.3/32",
    MEDIA_ROOT: "/var/lib/blog-x/media",
  };
  assert.throws(() => parseApiRuntimeConfig({ ...base, PUBLIC_ORIGIN: "http://blog.example" }, "serve"), /PUBLIC_ORIGIN/);
  assert.throws(() => parseApiRuntimeConfig({ ...base, DATABASE_URL: undefined }, "serve"), /DATABASE_URL/);
  assert.throws(() => parseApiRuntimeConfig({ ...base, BLOG_X_LOGIN_LIMIT: "0" }, "serve"), /BLOG_X_LOGIN_LIMIT/);
  assert.throws(() => parseApiRuntimeConfig({ ...base, TRUSTED_PROXY_CIDRS: "not-an-address" }, "serve"), /TRUSTED_PROXY_CIDRS/);
  assert.throws(() => parseApiRuntimeConfig({ ...base, TRUSTED_PROXY_CIDRS: "198.51.100.1/32" }, "serve"), /TRUSTED_PROXY_CIDRS/);
  assert.throws(() => parseApiRuntimeConfig({ ...base, TRUSTED_PROXY_CIDRS: undefined }, "serve"), /TRUSTED_PROXY_CIDRS/);
  assert.throws(() => parseApiRuntimeConfig({ ...base, TRUSTED_PROXY_CIDRS: "172.30.0.0/24" }, "serve"), /TRUSTED_PROXY_CIDRS/);
  assert.deepEqual(parseApiRuntimeConfig({ ...base, TRUSTED_PROXY_CIDRS: "172.30.0.3/32" }, "serve").trustedProxyAddresses, ["172.30.0.3/32"]);
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
  assert.deepEqual(config.trustedProxyAddresses, ["127.0.0.1/8", "::1/128"]);
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

test("auth logout, schedule mutations, and legacy publish have named unsafe route policies", () => {
  const named = unsafeRoutePolicies.map((policy) => `${policy.method} ${policy.url}`);
  assert.deepEqual(named, [
    "POST /auth/login",
    "POST /auth/logout",
    "POST /auth/password",
    "POST /admin/posts/preview",
    "POST /admin/posts",
    "PUT /admin/posts/:id",
    "PUT /admin/posts/:id/schedule",
    "DELETE /admin/posts/:id/schedule",
    "POST /admin/posts/:id/schedule",
    "POST /admin/posts/:id/schedule/cancel",
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
    "DELETE /admin/media/:id",
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

test("authenticated media uploads distinguish invalid media from unavailable infrastructure without leaking details", async (context) => {
  const app = Fastify({ trustProxy: false });
  const origin = "http://127.0.0.1:3100";
  const sessionAuth = { administratorIdForToken: async (token: string | undefined) => token === "valid" ? "administrator-id" : null, issue: async () => "", revoke: async () => undefined };
  const rateStore = new BoundedRateLimitStore(new ManualClock(), 4_096);
  let failure: Error = new InvalidMediaError();
  let uploads = 0;

  await app.register(cookie as unknown as FastifyPluginAsync);
  await app.register(mediaRoutes, {
    mediaService: {
      upload: async () => {
        uploads += 1;
        throw failure;
      },
    } as never,
    sessionAuth,
    publicOrigin: origin,
    mutationGuard: { sessionAuth, publicOrigin: origin, rateStore, ratePolicy: { limit: 4, windowMs: 60_000 } },
  });
  context.after(() => app.close());

  const payload = multipartUpload();
  const headers = { cookie: "blog_x_session=valid", origin, "content-type": payload.contentType };
  const invalid = await app.inject({ method: "POST", url: "/admin/media", headers, payload: payload.body });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.json(), { error: "invalid_media" });

  failure = new Error("storage failure: /var/lib/blog-x/media/derivative/private-key.png");
  const unavailable = await app.inject({ method: "POST", url: "/admin/media", headers, payload: payload.body });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), { error: "media_unavailable" });
  assert.doesNotMatch(unavailable.body, /storage failure|var\/lib|derivative|private-key/i);
  assert.equal(uploads, 2);
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
