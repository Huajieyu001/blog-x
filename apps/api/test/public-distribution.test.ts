import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema.js";
import { buildApp } from "../src/app.js";
import { publicPostRoutes } from "../src/routes/public-posts.js";

const databaseUrl = process.env.PHASE3_TEST_DATABASE_URL;

test("Phase 3 distribution only exposes predicate-visible discovery facts", async (context) => {
  if (!databaseUrl) throw new Error("PHASE3_TEST_DATABASE_URL must name the runner-owned disposable migrated PostgreSQL database");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
    await pool.end();
  });

  const publicCategory = (await db.insert(schema.categories).values({ name: "Public category", slug: "public-category" }).returning())[0]!;
  const hiddenCategory = (await db.insert(schema.categories).values({ name: "hidden-category-marker", slug: "hidden-category-marker" }).returning())[0]!;
  const publicTag = (await db.insert(schema.tags).values({ name: "Public tag", slug: "public-tag" }).returning())[0]!;
  const hiddenTag = (await db.insert(schema.tags).values({ name: "hidden-tag-marker", slug: "hidden-tag-marker" }).returning())[0]!;
  const older = new Date("2026-08-09T08:00:00.000Z");
  const newer = new Date("2026-08-09T09:00:00.000Z");
  const [visibleOlder, visibleNewer] = await db.insert(schema.articles).values([
    { title: "Visible older", summary: "visible older summary", slug: "visible-older", markdown: "visible raw markdown marker", status: "published", publishedAt: older, categoryId: publicCategory.id },
    { title: "Visible newer", summary: "visible newer summary", slug: "visible-newer", markdown: "visible newer raw markdown marker", status: "published", publishedAt: newer, categoryId: publicCategory.id },
  ]).returning();
  await db.insert(schema.articleTags).values([
    { articleId: visibleOlder!.id, tagId: publicTag.id },
    { articleId: visibleNewer!.id, tagId: publicTag.id },
  ]);
  await db.insert(schema.articles).values([
    { title: "draft-hidden-marker", summary: "draft-hidden-marker", slug: "draft-hidden-marker", markdown: "draft-hidden-raw-marker", status: "draft", categoryId: hiddenCategory.id },
    { title: "unpublished-hidden-marker", summary: "unpublished-hidden-marker", slug: "unpublished-hidden-marker", markdown: "unpublished-hidden-raw-marker", status: "unpublished", publishedAt: newer, categoryId: hiddenCategory.id },
    { title: "deleted-hidden-marker", summary: "deleted-hidden-marker", slug: "deleted-hidden-marker", markdown: "deleted-hidden-raw-marker", status: "published", publishedAt: newer, deletedAt: newer, categoryId: hiddenCategory.id },
    { title: "null-published-hidden-marker", summary: "null-published-hidden-marker", slug: "null-published-hidden-marker", markdown: "null-published-hidden-raw-marker", status: "published", categoryId: hiddenCategory.id },
  ]);
  const hiddenArticle = (await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.slug, "draft-hidden-marker")))[0]!;
  await db.insert(schema.articleTags).values({ articleId: hiddenArticle.id, tagId: hiddenTag.id });
  await db.insert(schema.sitePages).values({ key: "about", title: "about-hidden-marker", markdown: "about-hidden-raw-marker", status: "draft" });

  const app = await buildApp({ publicOrigin: "http://127.0.0.1:3100" });
  context.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/public/distribution" });
  assert.equal(response.statusCode, 200, response.body);
  const payload = response.json();
  assert.deepEqual(Object.keys(payload).sort(), ["about", "articles", "categories", "tags"]);
  assert.deepEqual(payload.articles.map((article: { slug: string }) => article.slug), ["visible-newer", "visible-older"]);
  assert.deepEqual(payload.categories, [{ name: "Public category", slug: "public-category", articleCount: 2 }]);
  assert.deepEqual(payload.tags, [{ name: "Public tag", slug: "public-tag", articleCount: 2 }]);
  assert.equal(payload.about, null);
  assert.deepEqual(Object.keys(payload.articles[0]).sort(), ["category", "publishedAt", "slug", "summary", "tags", "title", "updatedAt"]);
  assert.deepEqual(payload.articles[0].tags, [{ name: "Public tag", slug: "public-tag" }]);
  assert.doesNotMatch(response.body, /(?:hidden-marker|raw markdown|source_key|derivative_key|markdown|deletedAt|session|administrator)/i);

  await pool.query("update site_pages set status = 'published', title = 'Public About' where key = 'about'");
  const withAbout = await app.inject({ method: "GET", url: "/public/distribution" });
  assert.equal(withAbout.statusCode, 200, withAbout.body);
  assert.deepEqual(withAbout.json().about.title, "Public About");
  assert.deepEqual(Object.keys(withAbout.json().about).sort(), ["title", "updatedAt"]);
});

test("Phase 3 distribution rejects malformed repository output instead of stripping private fields", async (context) => {
  const app = Fastify();
  await app.register(publicPostRoutes, {
    publicRepository: {
      distribution: async () => ({ articles: [], categories: [], tags: [], about: null, markdown: "private" }),
      findDetailBySlug: async () => null,
      listPage: async () => ({ page: 1, pageSize: 10 as const, totalItems: 0, totalPages: 0, items: [] }),
    } as never,
  });
  context.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/public/distribution" });
  assert.equal(response.statusCode, 500);
  assert.doesNotMatch(response.body, /private/);
});
