import assert from "node:assert/strict";
import test from "node:test";
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
