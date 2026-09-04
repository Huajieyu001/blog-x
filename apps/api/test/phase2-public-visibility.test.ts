import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { renderMarkdown } from "../src/content/markdown.js";
import * as schema from "../src/db/schema.js";

const databaseUrl = process.env.PHASE2_TEST_DATABASE_URL;
const origin = "http://127.0.0.1:3100";

function hasPgCode(expected: string) {
  return (error: unknown) => {
    let current: unknown = error;
    while (current && typeof current === "object") {
      if ((current as { code?: string }).code === expected) return true;
      current = (current as { cause?: unknown }).cause;
    }
    return false;
  };
}

test("Phase 2 public surfaces share one published-only boundary backed by final constraints", async (context) => {
  if (!databaseUrl) {
    context.skip("PHASE2_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
    await pool.end();
  });

  const category = (await db.insert(schema.categories).values({ name: "工程实践", slug: "engineering" }).returning())[0]!;
  const tag = (await db.insert(schema.tags).values({ name: "TypeScript", slug: "typescript" }).returning())[0]!;
  const asset = (await db.insert(schema.media).values({
    sourceKey: "source/00000000-0000-4000-8000-000000000011.bin",
    derivativeKey: "derivative/00000000-0000-4000-8000-000000000011.png",
    sourceMimeType: "image/png",
    derivativeMimeType: "image/png",
    sourceBytes: 64,
    derivativeBytes: 32,
    width: 32,
    height: 18,
  }).returning())[0]!;
  const now = new Date("2026-08-09T08:00:00.000Z");
  const published = (await db.insert(schema.articles).values({
    title: "公开的组合验收文章",
    summary: "只包含可公开摘要",
    slug: "phase-2-visible",
    markdown: "## 重复标题\n\n### 子章节\n\n## 重复标题\n\n![正文图](/media/00000000-0000-4000-8000-000000000011)",
    status: "published",
    publishedAt: now,
    categoryId: category.id,
    coverMediaId: asset.id,
    coverAlt: "横向封面图",
  }).returning())[0]!;
  await db.insert(schema.articleTags).values({ articleId: published.id, tagId: tag.id });
  await db.insert(schema.articles).values([
    { title: "草稿秘密", summary: "draft-secret", slug: "phase-2-draft", markdown: "raw-draft-secret", status: "draft", categoryId: category.id },
    { title: "下线秘密", summary: "unpublished-secret", slug: "phase-2-unpublished", markdown: "raw-unpublished-secret", status: "unpublished", publishedAt: now, categoryId: category.id },
    { title: "删除秘密", summary: "deleted-secret", slug: "phase-2-deleted", markdown: "raw-deleted-secret", status: "published", publishedAt: now, deletedAt: now, categoryId: category.id },
    { title: "未来公开秘密", summary: "future-public-secret", slug: "phase-2-future", markdown: "future-public-raw-secret", status: "published", publishedAt: new Date("2099-01-01T00:00:00.000Z"), categoryId: category.id },
  ]);

  await assert.rejects(db.insert(schema.categories).values({ name: "撞名", slug: category.slug }), hasPgCode("23505"));
  await assert.rejects(db.insert(schema.tags).values({ name: "撞名", slug: tag.slug }), hasPgCode("23505"));
  await assert.rejects(db.insert(schema.articleTags).values({ articleId: published.id, tagId: tag.id }), hasPgCode("23505"));
  const restrictViolation = /violates RESTRICT setting of foreign key constraint/i;
  await assert.rejects(pool.query("delete from categories where id = $1", [category.id]), restrictViolation, "category association is RESTRICT-owned by PostgreSQL");
  await assert.rejects(pool.query("delete from tags where id = $1", [tag.id]), restrictViolation, "tag association is RESTRICT-owned by PostgreSQL");
  await assert.rejects(pool.query("delete from media where id = $1", [asset.id]), restrictViolation, "cover source/derivative association is RESTRICT-owned by PostgreSQL");
  await assert.rejects(pool.query("insert into site_pages (key, title) values ('contact', 'Contact')"), hasPgCode("23514"));

  await db.insert(schema.sitePages).values({ key: "about", title: "不可见的关于草稿", markdown: "about-raw-secret", status: "draft" });
  await assert.rejects(db.insert(schema.sitePages).values({ key: "about", title: "重复 About", markdown: "" }), hasPgCode("23505"));

  const app = await buildApp({ publicOrigin: origin });
  context.after(async () => { await app.close(); });
  const paths = [
    "/public/articles?page=1",
    "/public/categories",
    "/public/tags",
    "/public/categories/engineering/articles?page=1",
    "/public/tags/typescript/articles?page=1",
    "/public/archives",
  ];
  const bodies: string[] = [];
  for (const path of paths) {
    const response = await app.inject({ method: "GET", url: path });
    assert.equal(response.statusCode, 200, `${path}: ${response.body}`);
    bodies.push(response.body);
  }
  const publicText = bodies.join("\n");
  assert.match(publicText, /phase-2-visible/);
  assert.doesNotMatch(publicText, /draft-secret|unpublished-secret|deleted-secret|future-public-secret|raw-.*-secret|source\/|derivative\/|about-raw-secret/i);

  for (const slug of ["phase-2-draft", "phase-2-unpublished", "phase-2-deleted", "phase-2-future", "phase-2-unknown"]) {
    const response = await app.inject({ method: "GET", url: `/public/articles/${slug}` });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "not_found" });
  }
  const hiddenAbout = await app.inject({ method: "GET", url: "/public/about" });
  assert.equal(hiddenAbout.statusCode, 404);
  assert.deepEqual(hiddenAbout.json(), { error: "not_found" });

  const detail = await app.inject({ method: "GET", url: "/public/articles/phase-2-visible" });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.deepEqual(detail.json().toc, [
    { id: "重复标题", depth: 2, text: "重复标题" },
    { id: "子章节", depth: 3, text: "子章节" },
    { id: "重复标题-2", depth: 2, text: "重复标题" },
  ]);
  assert.equal(detail.json().cover.url, `/media/${asset.id}`);
  assert.doesNotMatch(detail.body, /sourceKey|derivativeKey|source_key|derivative_key|source\//i);

  await pool.query("update site_pages set status = 'published', title = '关于本站', markdown = '# 公开介绍' where key = 'about'");
  const publicAbout = await app.inject({ method: "GET", url: "/public/about" });
  assert.equal(publicAbout.statusCode, 200, publicAbout.body);
  assert.deepEqual(Object.keys(publicAbout.json()).sort(), ["renderedHtml", "title", "updatedAt"]);
});

test("Phase 2 renderer preserves durable anchors and admits only exact local media paths", async () => {
  const validId = "00000000-0000-4000-8000-000000000001";
  const result = await renderMarkdown([
    "## API / 中文",
    "## API / 中文",
    "### API / 中文",
    `![valid](/media/${validId})`,
    "![traversal](/media/../../source/private.bin)",
    "![query](/media/00000000-0000-4000-8000-000000000002?source=1)",
    "![data](data:image/png;base64,AAAA)",
    "![file](file:///tmp/source.png)",
  ].join("\n\n"));
  assert.deepEqual(result.toc, [
    { id: "api-中文", depth: 2, text: "API / 中文" },
    { id: "api-中文-2", depth: 2, text: "API / 中文" },
    { id: "api-中文-3", depth: 3, text: "API / 中文" },
  ]);
  assert.match(result.html, new RegExp(`src="/media/${validId}"`));
  assert.doesNotMatch(result.html, /\.\.|source=|src="(?:data:|file:)|private\.bin/i);
});
