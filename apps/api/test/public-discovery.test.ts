import assert from "node:assert/strict";
import test from "node:test";
import {
  publicDiscoveryInternalErrorResponseSchema,
  publicRelatedPostsResponseSchema,
  publicSearchQuerySchema,
  publicSearchResponseSchema,
  publicSearchUnavailableResponseSchema,
} from "@blog-x/contracts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import Fastify from "fastify";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { createPublicRepository, SearchUnavailableError, type PublicRepository } from "../src/content/public-repository.js";
import * as schema from "../src/db/schema.js";
import { publicPostRoutes } from "../src/routes/public-posts.js";

const databaseUrl = process.env.PUBLIC_DISCOVERY_TEST_DATABASE_URL;

function article(overrides: Partial<typeof schema.articles.$inferInsert> & Pick<typeof schema.articles.$inferInsert, "id" | "slug">) {
  return {
    title: "Fixture article",
    summary: "Fixture summary",
    markdown: "Fixture markdown",
    status: "published",
    publishedAt: new Date("2026-08-15T12:00:00.000Z"),
    ...overrides,
  } satisfies typeof schema.articles.$inferInsert;
}

function normalizedQuery(q: string) {
  return publicSearchQuerySchema.parse({ q }).q;
}

test("published search is literal, multilingual, strict, ranked, and stable", async (context) => {
  if (!databaseUrl) {
    context.skip("PUBLIC_DISCOVERY_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repository = createPublicRepository(db);
  context.after(async () => {
    await pool.query("truncate table article_tags, articles, categories, tags cascade");
    await pool.end();
  });

  const categoryId = "10000000-0000-4000-8000-000000000001";
  const tagA = "20000000-0000-4000-8000-000000000001";
  const tagB = "20000000-0000-4000-8000-000000000002";
  await db.insert(schema.categories).values({ id: categoryId, name: "Engineering", slug: "engineering" });
  await db.insert(schema.tags).values([
    { id: tagB, name: "Same", slug: "same-b" },
    { id: tagA, name: "Same", slug: "same-a" },
  ]);

  const baseTime = new Date("2026-08-15T12:00:00.000Z");
  const rows = [
    article({ id: "30000000-0000-4000-8000-000000000001", slug: "rank-title", title: "Needle in title", summary: "ordinary", markdown: "ordinary", categoryId }),
    article({ id: "30000000-0000-4000-8000-000000000002", slug: "rank-summary", title: "ordinary", summary: "Needle in summary", markdown: "ordinary" }),
    article({ id: "30000000-0000-4000-8000-000000000003", slug: "rank-markdown", title: "ordinary", summary: "ordinary", markdown: "Needle in markdown" }),
    article({ id: "30000000-0000-4000-8000-000000000004", slug: "rank-newer", title: "Needle newer", publishedAt: new Date("2026-08-16T12:00:00.000Z") }),
    article({ id: "30000000-0000-4000-8000-000000000005", slug: "rank-uuid-high", title: "Needle tie", publishedAt: baseTime }),
    article({ id: "30000000-0000-4000-8000-000000000006", slug: "rank-uuid-higher", title: "Needle tie", publishedAt: baseTime }),
    article({ id: "30000000-0000-4000-8000-000000000007", slug: "literal-percent", title: "100% literal" }),
    article({ id: "30000000-0000-4000-8000-000000000008", slug: "literal-underscore", title: "under_score" }),
    article({ id: "30000000-0000-4000-8000-000000000009", slug: "literal-backslash", title: String.raw`slash\value` }),
    article({ id: "30000000-0000-4000-8000-000000000010", slug: "multilingual", title: "中文 API CAFÉ 😀" }),
    article({ id: "30000000-0000-4000-8000-000000000011", slug: "decomposed-storage", title: "Cafe\u0301 stored decomposed" }),
    article({ id: "30000000-0000-4000-8000-000000000012", slug: "hidden-draft", title: "HIDDEN_DRAFT_TITLE", summary: "HIDDEN_DRAFT_SUMMARY", markdown: "HIDDEN_DRAFT_MARKDOWN", status: "draft", publishedAt: null }),
    article({ id: "30000000-0000-4000-8000-000000000013", slug: "hidden-unpublished", title: "HIDDEN_UNPUBLISHED_TITLE", summary: "HIDDEN_UNPUBLISHED_SUMMARY", markdown: "HIDDEN_UNPUBLISHED_MARKDOWN", status: "unpublished" }),
    article({ id: "30000000-0000-4000-8000-000000000014", slug: "hidden-deleted", title: "HIDDEN_DELETED_TITLE", summary: "HIDDEN_DELETED_SUMMARY", markdown: "HIDDEN_DELETED_MARKDOWN", deletedAt: baseTime }),
    article({ id: "30000000-0000-4000-8000-000000000015", slug: "hidden-null-time", title: "HIDDEN_NULL_TITLE", summary: "HIDDEN_NULL_SUMMARY", markdown: "HIDDEN_NULL_MARKDOWN", publishedAt: null }),
    article({ id: "30000000-0000-4000-8000-000000000016", slug: "hidden-future-time", title: "HIDDEN_FUTURE_TITLE", summary: "HIDDEN_FUTURE_SUMMARY", markdown: "HIDDEN_FUTURE_MARKDOWN", publishedAt: new Date("2099-01-01T00:00:00.000Z") }),
  ];
  await db.insert(schema.articles).values(rows);
  await db.insert(schema.articleTags).values([
    { articleId: rows[0]!.id, tagId: tagB },
    { articleId: rows[0]!.id, tagId: tagA },
  ]);

  const ranked = await repository.searchPage(normalizedQuery("needle"), 1);
  assert.deepEqual(ranked.items.map((item) => item.slug), [
    "rank-newer",
    "rank-uuid-higher",
    "rank-uuid-high",
    "rank-title",
    "rank-summary",
    "rank-markdown",
  ]);
  assert.equal(ranked.state, "results");
  assert.deepEqual(ranked.items.find((item) => item.slug === "rank-title")?.tags, [
    { name: "Same", slug: "same-a" },
    { name: "Same", slug: "same-b" },
  ]);
  assert.deepEqual(publicSearchResponseSchema.parse(ranked), ranked);
  const serialized = JSON.stringify(ranked);
  for (const item of ranked.items) {
    assert.deepEqual(Object.keys(item).sort(), ["category", "publishedAt", "slug", "status", "summary", "tags", "title"]);
  }
  for (const forbidden of ["\"markdown\":", "\"score\":", "\"matchedField\":", "\"deletedAt\":", "HIDDEN_"]) assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  assert.deepEqual(await repository.searchPage(normalizedQuery("needle"), 1), ranked);

  const app = await buildApp({ resources: { pool, db }, publicOrigin: "http://127.0.0.1:3100" });
  context.after(async () => { await app.close(); });
  const routeResult = await app.inject({ method: "GET", url: "/public/search?q=needle&page=1" });
  assert.equal(routeResult.statusCode, 200, routeResult.body);
  assert.deepEqual(routeResult.json(), ranked);

  for (const [query, expectedSlugs] of [
    ["%", ["literal-percent"]],
    ["_", ["literal-underscore"]],
    ["\\", ["literal-backslash"]],
    ["中文", ["multilingual"]],
    ["api", ["multilingual"]],
    ["😀", ["multilingual"]],
    ["CAFE\u0301", ["decomposed-storage", "multilingual"]],
    ["Café stored", ["decomposed-storage"]],
  ] as const) {
    const result = await repository.searchPage(normalizedQuery(query), 1);
    assert.deepEqual(result.items.map((item) => item.slug), expectedSlugs, query);
  }

  for (const query of ["' OR 1=1 --", "HIDDEN_DRAFT", "HIDDEN_UNPUBLISHED", "HIDDEN_DELETED", "HIDDEN_NULL", "HIDDEN_FUTURE"]) {
    const result = await repository.searchPage(normalizedQuery(query), 1);
    assert.deepEqual(result, { state: "no_results", query: normalizedQuery(query), page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] });
  }
  assert.equal((await pool.query("select count(*)::int as count from articles")).rows[0].count, rows.length);
});

test("search pagination is bounded and byte-stable across publication and UUID ties", async (context) => {
  if (!databaseUrl) {
    context.skip("PUBLIC_DISCOVERY_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repository = createPublicRepository(db);
  context.after(async () => {
    await pool.query("truncate table article_tags, articles, categories, tags cascade");
    await pool.end();
  });
  await pool.query("truncate table article_tags, articles, categories, tags cascade");
  const publishedAt = new Date("2026-08-15T12:00:00.000Z");
  await db.insert(schema.articles).values(Array.from({ length: 12 }, (_, index) => article({
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    slug: `stable-${index + 1}`,
    title: `Stable match ${index + 1}`,
    publishedAt,
  })));
  const first = await repository.searchPage("stable", 1);
  const second = await repository.searchPage("stable", 2);
  assert.deepEqual(first.items.map((item) => item.slug), Array.from({ length: 10 }, (_, index) => `stable-${12 - index}`));
  assert.deepEqual(second.items.map((item) => item.slug), ["stable-2", "stable-1"]);
  assert.deepEqual(await repository.searchPage("stable", 1), first);
  assert.deepEqual(await repository.searchPage("stable", 100), { state: "page_out_of_range", query: "stable", page: 100, pageSize: 10, totalItems: 12, totalPages: 2, items: [] });
  assert.deepEqual(await repository.searchPage("absent", 1), { state: "no_results", query: "absent", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] });
  assert.deepEqual(await repository.searchPage("", 1), { state: "empty_query", query: "", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] });
});

test("only PostgreSQL cancellation is typed as search unavailable", async () => {
  const timeout = Object.assign(new Error("statement timeout"), { code: "57014" });
  const unavailable = createPublicRepository({ transaction: async () => { throw timeout; } } as never);
  await assert.rejects(() => unavailable.searchPage("query", 1), SearchUnavailableError);

  const unrelated = Object.assign(new Error("connection failed"), { code: "08006" });
  const broken = createPublicRepository({ transaction: async () => { throw unrelated; } } as never);
  await assert.rejects(() => broken.searchPage("query", 1), (error: unknown) => error === unrelated);
});

test("related posts require public overlap and use deterministic category/tag/time/UUID ranking", async (context) => {
  if (!databaseUrl) {
    context.skip("PUBLIC_DISCOVERY_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repository = createPublicRepository(db);
  context.after(async () => {
    await pool.query("truncate table article_tags, articles, categories, tags cascade");
    await pool.end();
  });
  await pool.query("truncate table article_tags, articles, categories, tags cascade");

  const category = "50000000-0000-4000-8000-000000000001";
  const otherCategory = "50000000-0000-4000-8000-000000000002";
  const tagIds = [
    "51000000-0000-4000-8000-000000000001",
    "51000000-0000-4000-8000-000000000002",
    "51000000-0000-4000-8000-000000000003",
  ];
  await db.insert(schema.categories).values([
    { id: category, name: "Primary", slug: "primary" },
    { id: otherCategory, name: "Other", slug: "other" },
  ]);
  await db.insert(schema.tags).values(tagIds.map((id, index) => ({ id, name: `Tag ${index + 1}`, slug: `tag-${index + 1}` })));

  const tiedTime = new Date("2026-08-15T12:00:00.000Z");
  const candidates = [
    article({ id: "52000000-0000-4000-8000-000000000001", slug: "source", title: "Source", categoryId: category }),
    article({ id: "52000000-0000-4000-8000-000000000002", slug: "category-zero-tags", title: "Category zero", categoryId: category, publishedAt: new Date("2026-08-10T12:00:00.000Z") }),
    article({ id: "52000000-0000-4000-8000-000000000003", slug: "category-one-tag", title: "Category one", categoryId: category, publishedAt: tiedTime }),
    article({ id: "52000000-0000-4000-8000-000000000004", slug: "category-two-tags-low-id", title: "Category two low", categoryId: category, publishedAt: tiedTime }),
    article({ id: "52000000-0000-4000-8000-000000000005", slug: "category-two-tags-high-id", title: "Category two high", categoryId: category, publishedAt: tiedTime }),
    article({ id: "52000000-0000-4000-8000-000000000006", slug: "tag-only-three", title: "Tag only", categoryId: otherCategory, publishedAt: new Date("2026-08-20T12:00:00.000Z") }),
    article({ id: "52000000-0000-4000-8000-000000000007", slug: "no-overlap", title: "No overlap", categoryId: otherCategory }),
    article({ id: "52000000-0000-4000-8000-000000000008", slug: "hidden-strong", title: "RELATED_HIDDEN_DRAFT", categoryId: category, status: "draft", publishedAt: null }),
    article({ id: "52000000-0000-4000-8000-000000000009", slug: "hidden-unpublished-related", title: "RELATED_HIDDEN_UNPUBLISHED", categoryId: category, status: "unpublished" }),
    article({ id: "52000000-0000-4000-8000-000000000010", slug: "hidden-deleted-related", title: "RELATED_HIDDEN_DELETED", categoryId: category, deletedAt: tiedTime }),
    article({ id: "52000000-0000-4000-8000-000000000011", slug: "hidden-null-related", title: "RELATED_HIDDEN_NULL", categoryId: category, publishedAt: null }),
    article({ id: "52000000-0000-4000-8000-000000000012", slug: "hidden-future-related", title: "RELATED_HIDDEN_FUTURE", categoryId: category, publishedAt: new Date("2099-01-01T00:00:00.000Z") }),
  ];
  await db.insert(schema.articles).values(candidates);
  const tagsFor = (articleId: string, count: number) => tagIds.slice(0, count).map((tagId) => ({ articleId, tagId }));
  await db.insert(schema.articleTags).values([
    ...tagsFor(candidates[0]!.id, 3),
    ...tagsFor(candidates[2]!.id, 1),
    ...tagsFor(candidates[3]!.id, 2),
    ...tagsFor(candidates[4]!.id, 2),
    ...tagsFor(candidates[5]!.id, 3),
    ...tagsFor(candidates[7]!.id, 3),
    ...tagsFor(candidates[8]!.id, 3),
    ...tagsFor(candidates[9]!.id, 3),
    ...tagsFor(candidates[10]!.id, 3),
    ...tagsFor(candidates[11]!.id, 3),
  ]);

  const related = await repository.relatedBySlug("source");
  assert.ok(related);
  assert.deepEqual(related.items.map((item) => item.slug), [
    "category-two-tags-high-id",
    "category-two-tags-low-id",
    "category-one-tag",
    "category-zero-tags",
  ]);
  assert.equal(related.items.some((item) => item.slug === "source" || item.slug === "tag-only-three" || item.slug === "no-overlap"), false);
  assert.deepEqual(publicRelatedPostsResponseSchema.parse(related), related);
  for (const item of related.items) assert.deepEqual(Object.keys(item).sort(), ["category", "publishedAt", "slug", "status", "summary", "tags", "title"]);
  assert.doesNotMatch(JSON.stringify(related), /RELATED_HIDDEN|score|sharedTagCount|candidateId|sourceId/);

  const app = await buildApp({ resources: { pool, db }, publicOrigin: "http://127.0.0.1:3100" });
  context.after(async () => { await app.close(); });
  const routeResult = await app.inject({ method: "GET", url: "/public/articles/source/related" });
  assert.equal(routeResult.statusCode, 200, routeResult.body);
  assert.deepEqual(routeResult.json(), related);

  for (const hiddenSlug of ["hidden-strong", "hidden-unpublished-related", "hidden-deleted-related", "hidden-null-related", "hidden-future-related", "unknown-related"]) {
    assert.equal(await repository.relatedBySlug(hiddenSlug), null, hiddenSlug);
  }

  await db.update(schema.articles).set({ status: "unpublished" }).where(eq(schema.articles.id, candidates[4]!.id));
  assert.equal((await repository.relatedBySlug("source"))?.items.some((item) => item.slug === "category-two-tags-high-id"), false);
  await db.update(schema.articles).set({ status: "published" }).where(eq(schema.articles.id, candidates[4]!.id));
  assert.equal((await repository.relatedBySlug("source"))?.items[0]?.slug, "category-two-tags-high-id");
  await db.update(schema.articles).set({ deletedAt: tiedTime }).where(eq(schema.articles.id, candidates[4]!.id));
  assert.equal((await repository.relatedBySlug("source"))?.items.some((item) => item.slug === "category-two-tags-high-id"), false);
  await db.update(schema.articles).set({ status: "unpublished" }).where(eq(schema.articles.id, candidates[0]!.id));
  assert.equal(await repository.relatedBySlug("source"), null);
  await db.update(schema.articles).set({ status: "published" }).where(eq(schema.articles.id, candidates[0]!.id));
  assert.ok(await repository.relatedBySlug("source"));
});

test("related posts return an honest empty result when a public source has no taxonomy overlap", async (context) => {
  if (!databaseUrl) {
    context.skip("PUBLIC_DISCOVERY_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repository = createPublicRepository(db);
  context.after(async () => {
    await pool.query("truncate table article_tags, articles, categories, tags cascade");
    await pool.end();
  });
  await pool.query("truncate table article_tags, articles, categories, tags cascade");
  await db.insert(schema.articles).values([
    article({ id: "53000000-0000-4000-8000-000000000001", slug: "isolated-source", title: "Isolated" }),
    article({ id: "53000000-0000-4000-8000-000000000002", slug: "unrelated-public", title: "Unrelated" }),
  ]);
  assert.deepEqual(await repository.relatedBySlug("isolated-source"), { items: [] });
});

function stubRepository(overrides: Partial<PublicRepository> = {}): PublicRepository {
  const unavailable = async () => { throw new Error("unexpected repository call"); };
  return {
    distribution: unavailable,
    findDetailBySlug: unavailable,
    listPage: unavailable,
    relatedBySlug: unavailable,
    searchPage: unavailable,
    ...overrides,
  } as PublicRepository;
}

test("public search route fails closed and never scans for an empty normalized query", async (context) => {
  const app = Fastify();
  await app.register(publicPostRoutes, { publicRepository: stubRepository() });
  context.after(async () => { await app.close(); });

  for (const url of ["/public/search", "/public/search?q=%E3%80%80%09"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { state: "empty_query", query: "", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] });
  }

  for (const url of [
    "/public/search?q=one&q=two",
    "/public/search?q=one&unknown=value",
    `/public/search?q=${"x".repeat(257)}`,
  ]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 400, response.body);
    assert.deepEqual(response.json(), { error: "invalid_search_query" });
  }
  for (const url of ["/public/search?q=one&page=0", "/public/search?q=one&page=101", "/public/search?q=one&page=1.5", "/public/search?q=one&page=1&page=2"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 400, response.body);
    assert.deepEqual(response.json(), { error: "invalid_search_page" });
  }
});

test("discovery routes expose only typed 503 and exact opaque route-local 500 bodies", async (context) => {
  const hostile = "SELECT * FROM articles WHERE title ILIKE '%\\_%'; DATABASE_URL=postgres://fixture:${ROUTE_SECRET}@203.0.113.77:5432/blog_x ENV_SECRET=phase6-secret SERVER=203.0.113.77";

  const timeoutApp = Fastify();
  await timeoutApp.register(publicPostRoutes, {
    publicRepository: stubRepository({ searchPage: async () => { throw new SearchUnavailableError(); } }),
  });
  context.after(async () => { await timeoutApp.close(); });
  const timeout = await timeoutApp.inject({ method: "GET", url: "/public/search?q=timeout" });
  assert.equal(timeout.statusCode, 503, timeout.body);
  assert.deepEqual(publicSearchUnavailableResponseSchema.parse(timeout.json()), { error: "search_unavailable" });

  for (const [method, url, repository] of [
    ["search", "/public/search?q=explode", stubRepository({ searchPage: async () => { throw new Error(hostile); } })],
    ["related", "/public/articles/public-source/related", stubRepository({ relatedBySlug: async () => { throw new Error(hostile); } })],
  ] as const) {
    const app = Fastify();
    await app.register(publicPostRoutes, { publicRepository: repository });
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 500, `${method}: ${response.body}`);
    assert.equal(response.body, '{"error":"discovery_error"}');
    assert.deepEqual(publicDiscoveryInternalErrorResponseSchema.parse(response.json()), { error: "discovery_error" });
    const exposed = `${response.statusMessage}\n${JSON.stringify(response.headers)}\n${response.body}`;
    for (const secret of ["SELECT", "ILIKE", "ROUTE_SECRET", "phase6-secret", "203.0.113.77", "DATABASE_URL", "postgres://"]) {
      assert.doesNotMatch(exposed, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${method} leaked ${secret}`);
    }
    await app.close();
  }
});

test("related route returns one indistinguishable not_found contract for every unavailable source", async (context) => {
  const app = Fastify();
  await app.register(publicPostRoutes, { publicRepository: stubRepository({ relatedBySlug: async () => null }) });
  context.after(async () => { await app.close(); });
  const responses = await Promise.all(["unknown", "draft", "unpublished", "deleted", "null-time"].map((slug) => app.inject({ method: "GET", url: `/public/articles/${slug}/related` })));
  for (const response of responses) {
    assert.equal(response.statusCode, 404);
    assert.equal(response.body, '{"error":"not_found"}');
  }
  assert.equal(new Set(responses.map((response) => response.body)).size, 1);
});
