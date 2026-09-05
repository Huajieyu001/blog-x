import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { publicViewRoutes } from "../src/routes/public-views.js";
import { BoundedRateLimitStore, type Clock } from "../src/security/rate-limiter.js";

const publicOrigin = "http://127.0.0.1:3100";

class ManualClock implements Clock {
  constructor(private value = 0) {}
  now() { return this.value; }
  advance(milliseconds: number) { this.value += milliseconds; }
}

async function createViewApp({ limit = 2, capacity = 2, clock = new ManualClock() } = {}) {
  const calls: Array<{ slug: string; source: string }> = [];
  const app = Fastify({ trustProxy: false, logger: { level: "silent" } });
  await app.register(publicViewRoutes, {
    publicOrigin,
    rateStore: new BoundedRateLimitStore(clock, capacity),
    ratePolicy: { limit, windowMs: 60_000 },
    viewAggregationRepository: {
      recordPublicView: async (slug, source) => { calls.push({ slug, source }); return true; },
    },
  });
  return { app, calls, clock };
}

function opaque(response: { statusCode: number; body: string; headers: Record<string, string | string[] | undefined> }) {
  return { statusCode: response.statusCode, body: response.body, cacheControl: response.headers["cache-control"], retryAfter: response.headers["retry-after"] };
}

test("anonymous views classify only accepted traffic and keep rejections opaque", async (context) => {
  const { app, calls } = await createViewApp();
  context.after(() => app.close());
  const headers = { origin: publicOrigin, "content-type": "application/json", referer: "https://news.google.com/article" };
  const accepted = await app.inject({ method: "POST", url: "/public/articles/privacy-safe/view", headers, payload: {} });
  assert.deepEqual(opaque(accepted), { statusCode: 204, body: "", cacheControl: "no-store", retryAfter: undefined });
  assert.deepEqual(calls, [{ slug: "privacy-safe", source: "search" }]);

  const crawler = await app.inject({ method: "POST", url: "/public/articles/privacy-safe/view", headers: { ...headers, "user-agent": "Googlebot/2.1" }, payload: {} });
  const prefetch = await app.inject({ method: "POST", url: "/public/articles/privacy-safe/view", headers: { ...headers, purpose: "prefetch" }, payload: {} });
  const wrongOrigin = await app.inject({ method: "POST", url: "/public/articles/privacy-safe/view", headers: { ...headers, origin: "https://lookalike.invalid" }, payload: {} });
  for (const response of [crawler, prefetch, wrongOrigin]) assert.deepEqual(opaque(response), opaque(accepted));
  assert.deepEqual(calls, [{ slug: "privacy-safe", source: "search" }]);
});
