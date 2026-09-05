import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { classifyAnonymousViewRequest } from "../src/analytics/view-request-policy.js";
import { publicViewRoutes } from "../src/routes/public-views.js";
import { BoundedRateLimitStore, type Clock } from "../src/security/rate-limiter.js";

const publicOrigin = "http://127.0.0.1:3100";

class ManualClock implements Clock {
  constructor(private value = 0) {}
  now() { return this.value; }
  advance(milliseconds: number) { this.value += milliseconds; }
}

async function createViewApp({ limit = 2, capacity = 2, clock = new ManualClock(), failRepository = false } = {}) {
  const calls: Array<{ slug: string; source: string }> = [];
  const app = Fastify({ trustProxy: false, logger: { level: "silent" } });
  await app.register(publicViewRoutes, {
    publicOrigin,
    rateStore: new BoundedRateLimitStore(clock, capacity),
    ratePolicy: { limit, windowMs: 60_000 },
    viewAggregationRepository: {
      recordPublicView: async (slug, source) => {
        calls.push({ slug, source });
        if (failRepository) throw new Error("private transport failure");
        return true;
      },
    },
  });
  return { app, calls, clock };
}

function opaque(response: { statusCode: number; body: string; headers: Record<string, string | string[] | undefined> }) {
  return { statusCode: response.statusCode, body: response.body, cacheControl: response.headers["cache-control"], retryAfter: response.headers["retry-after"] };
}

test("request policy has fixed source roots, strict origins, and fail-closed transient automation", () => {
  const accepted = (headers: Parameters<typeof classifyAnonymousViewRequest>[0]) => classifyAnonymousViewRequest(headers, publicOrigin);
  assert.deepEqual(accepted({ origin: publicOrigin }), { accepted: true, source: "direct" });
  for (const origin of [undefined, "not-a-url", `${publicOrigin}/`, "https://127.0.0.1:3100", "http://127.0.0.1:3100.evil.invalid"]) {
    assert.deepEqual(accepted({ origin }), { accepted: false }, `Origin ${origin ?? "missing"} must fail closed`);
  }
  for (const headers of [
    { origin: publicOrigin, purpose: "prefetch" },
    { origin: publicOrigin, purpose: "navigate, prerender" },
    { origin: publicOrigin, secPurpose: "prefetch" },
    { origin: publicOrigin, nextRouterPrefetch: "1" },
    { origin: publicOrigin, nextRouterPrefetch: "true" },
    { origin: publicOrigin, userAgent: "Googlebot/2.1" },
    { origin: publicOrigin, userAgent: "Bingbot Baiduspider DuckDuckBot YandexBot Slurp" },
    { origin: publicOrigin, userAgent: "facebookexternalhit Twitterbot LinkedInBot Applebot" },
  ]) assert.deepEqual(accepted(headers), { accepted: false });
  assert.deepEqual(accepted({ origin: publicOrigin, nextRouterPrefetch: "false" }), { accepted: true, source: "direct" });

  const sources: Array<[string, string]> = [
    ["", "direct"], ["not a url", "direct"], ["file:///private/input", "direct"], [publicOrigin, "internal"],
    ["https://google.com/search", "search"], ["https://news.google.com/story", "search"], ["https://bing.com", "search"], ["https://m.baidu.com", "search"], ["https://duckduckgo.com", "search"], ["https://www.sogou.com", "search"], ["https://so.com", "search"], ["https://search.yahoo.com", "search"],
    ["https://bilibili.com", "social"], ["https://m.douban.com", "social"], ["https://facebook.com", "social"], ["https://linkedin.com", "social"], ["https://reddit.com", "social"], ["https://t.co", "social"], ["https://twitter.com", "social"], ["https://weibo.com", "social"], ["https://weixin.qq.com", "social"], ["https://x.com", "social"], ["https://zhihu.com", "social"],
    ["https://notgoogle.com", "external"], ["https://google.com.evil.invalid", "external"], ["https://example.invalid/path", "external"],
  ];
  for (const [referer, source] of sources) assert.deepEqual(accepted({ origin: publicOrigin, ...(referer ? { referer } : {}) }), { accepted: true, source });
});

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

test("anonymous view limiter is per-socket, capacity-bounded, expiry-safe, and never returns a retry hint", async (context) => {
  const clock = new ManualClock();
  const { app, calls } = await createViewApp({ limit: 2, capacity: 1, clock });
  context.after(() => app.close());
  const headers = { origin: publicOrigin, "content-type": "application/json" };
  const request = (remoteAddress: string) => app.inject({ method: "POST", url: "/public/articles/limited/view", headers, payload: {}, remoteAddress });
  const first = await request("198.51.100.1");
  const second = await request("198.51.100.1");
  const exhausted = await request("198.51.100.1");
  const capacity = await request("198.51.100.2");
  for (const response of [second, exhausted, capacity]) assert.deepEqual(opaque(response), opaque(first));
  assert.deepEqual(calls, [{ slug: "limited", source: "direct" }, { slug: "limited", source: "direct" }]);
  clock.advance(60_000);
  const recovered = await request("198.51.100.2");
  assert.deepEqual(opaque(recovered), opaque(first));
  assert.equal(calls.length, 3);
});

test("malformed, oversized, failed, and identity-bearing traffic remains opaque and never crosses the repository seam", async (context) => {
  const { app, calls } = await createViewApp();
  const failing = await createViewApp({ failRepository: true });
  context.after(async () => { await app.close(); await failing.app.close(); });
  const headers = {
    origin: publicOrigin,
    "content-type": "application/json",
    referer: "https://private.example.invalid/path?secret=value",
    "user-agent": "ordinary-browser private-agent",
  };
  const accepted = await app.inject({ method: "POST", url: "/public/articles/private-safe/view", headers, payload: {} });
  const malformed = await app.inject({ method: "POST", url: "/public/articles/private-safe/view", headers, payload: "{" });
  const nonEmpty = await app.inject({ method: "POST", url: "/public/articles/private-safe/view", headers, payload: { ignored: true } });
  const oversized = await app.inject({ method: "POST", url: "/public/articles/private-safe/view", headers, payload: JSON.stringify({ value: "x".repeat(300) }) });
  const repositoryFailure = await failing.app.inject({ method: "POST", url: "/public/articles/private-safe/view", headers, payload: {} });
  for (const response of [malformed, nonEmpty, oversized, repositoryFailure]) assert.deepEqual(opaque(response), opaque(accepted));
  assert.deepEqual(calls, [{ slug: "private-safe", source: "external" }]);
  assert.doesNotMatch(JSON.stringify(calls), /private\.example|private-agent|secret=value/);
});
