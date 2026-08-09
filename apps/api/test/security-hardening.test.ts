import assert from "node:assert/strict";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyPluginAsync } from "fastify";
import { authRoutes } from "../src/routes/auth.js";
import { parseApiRuntimeConfig } from "../src/security/config.js";
import { BoundedRateLimitStore, createRateLimitKey, type Clock } from "../src/security/rate-limiter.js";

class ManualClock implements Clock {
  constructor(private value = 0) {}
  now() { return this.value; }
  advance(milliseconds: number) { this.value += milliseconds; }
}

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
