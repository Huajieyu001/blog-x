import assert from "node:assert/strict";
import test from "node:test";
import { publicSearchQuerySchema, publicSearchResponseSchema } from "@blog-x/contracts";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createPublicRepository, SearchUnavailableError } from "../src/content/public-repository.js";
import * as schema from "../src/db/schema.js";

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

  for (const query of ["' OR 1=1 --", "HIDDEN_DRAFT", "HIDDEN_UNPUBLISHED", "HIDDEN_DELETED", "HIDDEN_NULL"]) {
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
