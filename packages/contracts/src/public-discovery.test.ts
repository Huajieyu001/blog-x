import assert from "node:assert/strict";
import test from "node:test";
import {
  invalidPublicSearchPageResponseSchema,
  invalidPublicSearchQueryResponseSchema,
  publicDiscoveryInternalErrorResponseSchema,
  publicRelatedPostLimit,
  publicRelatedPostsResponseSchema,
  publicSearchMaxPage,
  publicSearchMaxQueryCodePoints,
  publicSearchMaxRawCodeUnits,
  publicSearchPageSize,
  publicSearchQuerySchema,
  publicSearchResponseSchema,
  publicSearchUnavailableResponseSchema,
} from "./public-discovery.js";

const card = {
  title: "公开文章",
  summary: "摘要",
  slug: "public-post",
  publishedAt: "2026-08-15T00:00:00.000Z",
  status: "published" as const,
  category: null,
  tags: [{ name: "TypeScript", slug: "typescript" }],
};

test("discovery limits are fixed and low-resource", () => {
  assert.equal(publicSearchPageSize, 10);
  assert.equal(publicSearchMaxPage, 100);
  assert.equal(publicSearchMaxQueryCodePoints, 80);
  assert.equal(publicSearchMaxRawCodeUnits, 256);
  assert.equal(publicRelatedPostLimit, 4);
});

test("search input normalizes NFC after the raw cap and before the semantic cap", () => {
  assert.deepEqual(publicSearchQuerySchema.parse({}), { q: "", page: 1 });
  assert.deepEqual(publicSearchQuerySchema.parse({ q: "\u3000\t\n" }), { q: "", page: 1 });
  assert.deepEqual(publicSearchQuerySchema.parse({ q: "  Cafe\u0301  ", page: "2" }), { q: "Café", page: 2 });
  assert.equal(publicSearchQuerySchema.parse({ q: "Ａ" }).q, "Ａ", "NFKC compatibility folding is forbidden");
  assert.equal(publicSearchQuerySchema.safeParse({ q: "x".repeat(257) }).success, false);
  assert.equal(publicSearchQuerySchema.safeParse({ q: "😀".repeat(80) }).success, true);
  assert.equal(publicSearchQuerySchema.safeParse({ q: "😀".repeat(81) }).success, false);
  assert.equal(publicSearchQuerySchema.safeParse({ q: "a".repeat(256) }).success, false);
});

test("search input rejects duplicate, unknown, signed, blank, decimal, and out-of-range pages", () => {
  for (const input of [
    { q: ["one", "two"] },
    { q: "one", page: ["1", "2"] },
    { q: "one", extra: "field" },
    { q: "one", page: "" },
    { q: "one", page: "+1" },
    { q: "one", page: "0" },
    { q: "one", page: "1.5" },
    { q: "one", page: "101" },
  ]) assert.equal(publicSearchQuerySchema.safeParse(input).success, false, JSON.stringify(input));
  assert.deepEqual(publicSearchQuerySchema.parse({ q: "one", page: "100" }), { q: "one", page: 100 });
});

test("search response states are coherent strict public-card envelopes", () => {
  const valid = [
    { state: "empty_query", query: "", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] },
    { state: "no_results", query: "none", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] },
    { state: "results", query: "public", page: 1, pageSize: 10, totalItems: 1, totalPages: 1, items: [card] },
    { state: "page_out_of_range", query: "public", page: 2, pageSize: 10, totalItems: 1, totalPages: 1, items: [] },
  ];
  for (const response of valid) assert.equal(publicSearchResponseSchema.safeParse(response).success, true, response.state);

  const invalid = [
    { ...valid[0], query: "browse" },
    { ...valid[1], totalItems: 1 },
    { ...valid[2], items: [] },
    { ...valid[3], page: 1 },
    { ...valid[2], surprise: true },
    { ...valid[2], items: [{ ...card, markdown: "secret" }] },
    { ...valid[2], items: [{ ...card, id: "00000000-0000-4000-8000-000000000001" }] },
    { ...valid[2], items: [{ ...card, score: 3 }] },
    { ...valid[2], items: [{ ...card, deletedAt: null }] },
    { ...valid[2], items: [{ ...card, status: "draft" }] },
  ];
  for (const response of invalid) assert.equal(publicSearchResponseSchema.safeParse(response).success, false, JSON.stringify(response));
});

test("related response is capped at four strict public cards", () => {
  assert.equal(publicRelatedPostsResponseSchema.safeParse({ items: Array.from({ length: 4 }, (_, index) => ({ ...card, slug: `post-${index}` })) }).success, true);
  assert.equal(publicRelatedPostsResponseSchema.safeParse({ items: Array.from({ length: 5 }, (_, index) => ({ ...card, slug: `post-${index}` })) }).success, false);
  for (const extra of [{ score: 4 }, { sharedTagCount: 2 }, { sourceId: "x" }, { candidateId: "x" }, { markdown: "secret" }]) {
    assert.equal(publicRelatedPostsResponseSchema.safeParse({ items: [{ ...card, ...extra }] }).success, false);
  }
  assert.equal(publicRelatedPostsResponseSchema.safeParse({ items: [], internal: true }).success, false);
});

test("discovery errors are exact, strict, and opaque", () => {
  assert.deepEqual(invalidPublicSearchQueryResponseSchema.parse({ error: "invalid_search_query" }), { error: "invalid_search_query" });
  assert.deepEqual(invalidPublicSearchPageResponseSchema.parse({ error: "invalid_search_page" }), { error: "invalid_search_page" });
  assert.deepEqual(publicSearchUnavailableResponseSchema.parse({ error: "search_unavailable" }), { error: "search_unavailable" });
  assert.deepEqual(publicDiscoveryInternalErrorResponseSchema.parse({ error: "discovery_error" }), { error: "discovery_error" });
  for (const key of ["message", "stack", "sql", "pattern", "configuration", "address", "code", "status", "cause", "details"]) {
    assert.equal(publicDiscoveryInternalErrorResponseSchema.safeParse({ error: "discovery_error", [key]: "secret" }).success, false, key);
  }
});
