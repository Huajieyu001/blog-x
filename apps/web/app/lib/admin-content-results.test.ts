import assert from "node:assert/strict";
import test from "node:test";
import { getAdminAboutResult, getAdminAuditEventsResult, getAdminDeletedPostsResult, getAdminPostResult } from "./api.js";

function installFetch(fetcher: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  return () => { globalThis.fetch = original; };
}

test("About reads distinguish a missing page from an upstream failure", async (context) => {
  const outcomes = [new Response("{}", { status: 404 }), new Response("{}", { status: 503 })];
  context.after(installFetch(async () => outcomes.shift()!));

  assert.deepEqual(await getAdminAboutResult("cookie"), { kind: "not_found" });
  assert.deepEqual(await getAdminAboutResult("cookie"), { kind: "upstream_error" });
});

test("deleted rows fail closed when content fields are present", async (context) => {
  context.after(installFetch(async () => new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001", title: "deleted", slug: "deleted", statusBeforeDeletion: "draft", deletedAt: "2026-01-01T00:00:00.000Z", version: "2026-01-01T00:00:00.000Z", markdown: "secret" }]))));
  assert.deepEqual(await getAdminDeletedPostsResult("cookie"), { kind: "upstream_error" });
});

test("audit reads distinguish a genuine empty log from invalid upstream data", async (context) => {
  const outcomes = [
    new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    new Response(JSON.stringify({ items: "invalid", nextCursor: null }), { status: 200 }),
  ];
  context.after(installFetch(async () => outcomes.shift()!));

  assert.deepEqual(await getAdminAuditEventsResult("cookie"), { kind: "ok", data: { items: [], nextCursor: null } });
  assert.deepEqual(await getAdminAuditEventsResult("cookie"), { kind: "upstream_error" });
});

test("article reads distinguish a missing article from an unavailable or malformed response", async (context) => {
  const outcomes = [
    new Response("{}", { status: 404 }),
    new Response("{}", { status: 503 }),
    new Response(JSON.stringify({ id: "not-an-article" }), { status: 200 }),
  ];
  context.after(installFetch(async () => outcomes.shift()!));

  assert.deepEqual(await getAdminPostResult("post-id", "cookie"), { kind: "not_found" });
  assert.deepEqual(await getAdminPostResult("post-id", "cookie"), { kind: "upstream_error" });
  assert.deepEqual(await getAdminPostResult("post-id", "cookie"), { kind: "upstream_error" });
});
