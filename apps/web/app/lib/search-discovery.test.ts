import assert from "node:assert/strict";
import test from "node:test";
import type { PublicSearchResponse } from "@blog-x/contracts";
import {
  loadSearchDiscovery,
  resolveSearchCanonical,
  resolveSearchRequest,
  searchHref,
  type SearchDiscoveryOutcome,
  validSearchEncodingMarker,
} from "./search-discovery";

const published = {
  title: "唯一公开文章",
  summary: "摘要",
  slug: "only-public",
  publishedAt: "2026-08-09T09:00:00.000Z",
  status: "published" as const,
  category: { name: "工程", slug: "engineering" },
  tags: [{ name: "React", slug: "react" }],
};

function response(overrides: Partial<PublicSearchResponse> = {}): PublicSearchResponse {
  return {
    state: "results",
    query: "中文",
    page: 1,
    pageSize: 10,
    totalItems: 1,
    totalPages: 1,
    items: [published],
    ...overrides,
  } as PublicSearchResponse;
}

test("whole-object request resolution normalizes accepted values and rejects every unsupported shape", () => {
  assert.deepEqual(resolveSearchRequest({}, validSearchEncodingMarker), { kind: "accepted", query: "", page: 1 });
  assert.deepEqual(resolveSearchRequest({ q: "  e\u0301  ", page: "100" }, validSearchEncodingMarker), {
    kind: "accepted", query: "é", page: 100,
  });
  assert.deepEqual(resolveSearchRequest({ q: `${" ".repeat(176)}${"x".repeat(80)}` }, validSearchEncodingMarker), {
    kind: "accepted", query: "x".repeat(80), page: 1,
  });
  assert.deepEqual(resolveSearchRequest({ q: "😀".repeat(80) }, validSearchEncodingMarker), {
    kind: "accepted", query: "😀".repeat(80), page: 1,
  });
  assert.deepEqual(resolveSearchRequest({ q: "%ZZ" }, validSearchEncodingMarker), {
    kind: "accepted", query: "%ZZ", page: 1,
  });

  const invalid: Array<Record<string, string | string[] | undefined>> = [
    { q: ["a", "b"] },
    { q: "a", page: ["1", "2"] },
    { q: "a", extra: "x" },
    { q: `${" ".repeat(177)}${"x".repeat(80)}` },
    { q: "😀".repeat(81) },
    { q: "a", page: "101" },
    { q: "a", page: "01" },
    { q: "a", page: "1.0" },
    { q: "a", page: "+1" },
    { q: "a", page: "9007199254740992" },
  ];
  for (const parameters of invalid) {
    assert.deepEqual(resolveSearchRequest(parameters, validSearchEncodingMarker), { kind: "invalid" }, JSON.stringify(parameters));
  }
  assert.deepEqual(resolveSearchRequest({ q: "safe" }, "invalid"), { kind: "invalid" });
  assert.deepEqual(resolveSearchRequest({ q: "safe" }, null), { kind: "invalid" });
});

test("invalid requests perform zero discovery calls and accepted outcomes fail closed on request disagreement", async () => {
  let calls = 0;
  const fetchSearch = async () => {
    calls += 1;
    return { kind: "ok" as const, data: response() };
  };
  assert.deepEqual(await loadSearchDiscovery({ q: "safe", extra: "x" }, validSearchEncodingMarker, fetchSearch), { kind: "invalid" });
  assert.equal(calls, 0);
  const { state: _state, ...expected } = response();
  assert.deepEqual(await loadSearchDiscovery({ q: "中文" }, validSearchEncodingMarker, fetchSearch), { kind: "results", ...expected });
  assert.equal(calls, 1);
  assert.deepEqual(await loadSearchDiscovery({ q: "different" }, validSearchEncodingMarker, fetchSearch), {
    kind: "upstream_error", query: "different", page: 1,
  });
  assert.equal(calls, 2);
});

test("loader preserves strict item order and maps every transport state exhaustively", async () => {
  const second = { ...published, title: "第二篇", slug: "second" };
  const results = response({ totalItems: 2, items: [second, published] });
  const loaded = await loadSearchDiscovery({ q: "中文" }, validSearchEncodingMarker, async () => ({ kind: "ok", data: results }));
  assert.equal(loaded.kind, "results");
  if (loaded.kind === "results") assert.deepEqual(loaded.items.map((item) => item.slug), ["second", "only-public"]);

  const cases: Array<[PublicSearchResponse, string]> = [
    [response({ state: "empty_query", query: "", totalItems: 0, totalPages: 0, items: [] }), "empty_query"],
    [response({ state: "no_results", totalItems: 0, totalPages: 0, items: [] }), "no_results"],
    [response({ state: "page_out_of_range", page: 2, totalItems: 1, totalPages: 1, items: [] }), "page_out_of_range"],
  ];
  for (const [data, kind] of cases) {
    const query = data.query;
    const page = data.page;
    const outcome = await loadSearchDiscovery({ q: query, ...(page === 1 ? {} : { page: String(page) }) }, validSearchEncodingMarker, async () => ({ kind: "ok", data }));
    assert.equal(outcome.kind, kind);
  }
  assert.deepEqual(await loadSearchDiscovery({ q: "中文" }, validSearchEncodingMarker, async () => ({ kind: "upstream_error" })), {
    kind: "upstream_error", query: "中文", page: 1,
  });
});

test("repeated and concurrent accepted reads keep the same strict projection", async () => {
  const expected = response();
  const fetchSearch = async () => ({ kind: "ok" as const, data: expected });
  const outcomes = await Promise.all(Array.from({ length: 4 }, () => (
    loadSearchDiscovery({ q: "中文" }, validSearchEncodingMarker, fetchSearch)
  )));
  assert.deepEqual(outcomes, Array.from({ length: 4 }, () => {
    const { state: _state, ...payload } = expected;
    return { kind: "results", ...payload };
  }));
});

test("search href round-trips normalized Unicode and reserved characters while omitting page one", () => {
  assert.equal(searchHref("中文 & React+100%", 1), "/search?q=%E4%B8%AD%E6%96%87+%26+React%2B100%25");
  assert.equal(searchHref("中文 & React+100%", 2), "/search?q=%E4%B8%AD%E6%96%87+%26+React%2B100%25&page=2");
});

test("canonical is allowed only for normalized successful real shapes", () => {
  const outcomes = {
    invalid: { kind: "invalid" as const },
    upstream: { kind: "upstream_error" as const, query: "中文", page: 1 },
    empty: { kind: "empty_query" as const, ...response({ state: "empty_query", query: "", totalItems: 0, totalPages: 0, items: [] }) },
    zero: { kind: "no_results" as const, ...response({ state: "no_results", totalItems: 0, totalPages: 0, items: [] }) },
    result1: { kind: "results" as const, ...response() },
    result2: { kind: "results" as const, ...response({ page: 2, totalItems: 11, totalPages: 2 }) },
    out: { kind: "page_out_of_range" as const, ...response({ state: "page_out_of_range", page: 2, totalItems: 1, totalPages: 1, items: [] }) },
  };
  assert.equal(resolveSearchCanonical(outcomes.invalid), undefined);
  assert.equal(resolveSearchCanonical(outcomes.upstream), undefined);
  assert.equal(resolveSearchCanonical(outcomes.empty as SearchDiscoveryOutcome), undefined);
  assert.equal(resolveSearchCanonical(outcomes.out as SearchDiscoveryOutcome), undefined);
  assert.equal(resolveSearchCanonical(outcomes.zero as SearchDiscoveryOutcome), "/search?q=%E4%B8%AD%E6%96%87");
  assert.equal(resolveSearchCanonical(outcomes.result1 as SearchDiscoveryOutcome), "/search?q=%E4%B8%AD%E6%96%87");
  assert.equal(resolveSearchCanonical(outcomes.result2 as SearchDiscoveryOutcome), "/search?q=%E4%B8%AD%E6%96%87&page=2");
});
