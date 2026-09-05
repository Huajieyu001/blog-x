import assert from "node:assert/strict";
import test from "node:test";
import { getAdminAnalytics, getAdminPostsResult } from "./api.js";

const post = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Draft",
  summary: "",
  coverUrl: "",
  slug: "draft",
  markdown: "# Draft",
  publishedAt: null,
  seoDescription: "",
  categoryId: null,
  tagIds: [],
  status: "draft",
  legacyMediaReview: "clear",
  version: "2026-09-05T00:00:00.000Z",
  scheduledAt: null,
};

const analytics = {
  range: 30,
  timezone: "Asia/Shanghai",
  fromDay: "2026-08-07",
  toDay: "2026-09-05",
  totalPv: 2,
  daily: Array.from({ length: 30 }, (_, index) => ({
    day: `2026-${index < 25 ? "08" : "09"}-${String(index < 25 ? index + 7 : index - 24).padStart(2, "0")}`,
    pv: index === 29 ? 2 : 0,
  })),
  sources: [
    { source: "direct", totalPv: 2 }, { source: "internal", totalPv: 0 }, { source: "search", totalPv: 0 },
    { source: "social", totalPv: 0 }, { source: "external", totalPv: 0 },
  ],
  topArticles: [{ articleId: "00000000-0000-4000-8000-000000000001", title: "Published", status: "published", totalPv: 2 }],
};

function installFetch(fetcher: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  return () => { globalThis.fetch = original; };
}

test("admin post and analytics helpers forward only the server cookie, use no-store, and strictly parse complete responses", async (context) => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  context.after(installFetch(async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify(String(input).includes("analytics") ? analytics : [post]), { status: 200 });
  }));

  assert.deepEqual(await getAdminPostsResult("blog_x_session=secret"), { kind: "ok", data: [post] });
  assert.deepEqual(await getAdminAnalytics("blog_x_session=secret", 30, 1), { kind: "ok", data: analytics });
  assert.deepEqual(requests, [
    { url: "http://127.0.0.1:3001/admin/posts", init: { cache: "no-store", headers: { cookie: "blog_x_session=secret" } } },
    { url: "http://127.0.0.1:3001/admin/analytics?range=30&limit=1", init: { cache: "no-store", headers: { cookie: "blog_x_session=secret" } } },
  ]);
});

test("admin helpers distinguish non-2xx, network, malformed JSON, and invalid complete analytics contracts from valid empty data", async (context) => {
  const outcomes: Array<Response | Error> = [
    new Response("{}", { status: 503 }),
    new Error("network unavailable"),
    new Response("not json", { status: 200 }),
    new Response(JSON.stringify({ ...analytics, totalPv: 1 }), { status: 200 }),
    new Response(JSON.stringify([]), { status: 200 }),
  ];
  context.after(installFetch(async () => {
    const next = outcomes.shift();
    if (next instanceof Error) throw next;
    return next!;
  }));

  assert.deepEqual(await getAdminPostsResult("cookie"), { kind: "upstream_error" });
  assert.deepEqual(await getAdminPostsResult("cookie"), { kind: "upstream_error" });
  assert.deepEqual(await getAdminAnalytics("cookie", 30, 1), { kind: "upstream_error" });
  assert.deepEqual(await getAdminAnalytics("cookie", 30, 1), { kind: "upstream_error" });
  assert.deepEqual(await getAdminPostsResult("cookie"), { kind: "ok", data: [] });
});
