import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { portableExportManifestSchema } from "@blog-x/contracts";
import { buildApp } from "../src/app.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import * as schema from "../src/db/schema.js";

const databaseUrl = process.env.PHASE3_TEST_DATABASE_URL;
const origin = "http://127.0.0.1:3100";

function sessionCookie(setCookie: string) {
  const match = /^blog_x_session=([^;]+)/.exec(setCookie);
  assert.ok(match, "login must issue a session cookie");
  return `blog_x_session=${match[1]}`;
}

test("the protected export reconstructs every retained source state without binary or infrastructure disclosure", async () => {
  if (!databaseUrl) throw new Error("PHASE3_TEST_DATABASE_URL must name the runner-owned disposable migrated PostgreSQL database");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
  const username = `export-${Date.now()}`;
  const password = "export-test-password";
  await seedAdministrator(db, { username, password });
  const createdAt = new Date("2026-08-09T08:00:00.000Z");
  const updatedAt = new Date("2026-08-09T09:00:00.000Z");
  const publishedAt = new Date("2026-08-09T10:00:00.000Z");
  const scheduledAt = new Date("2030-12-01T02:15:30.000Z");
  const deletedAt = new Date("2026-08-09T11:00:00.000Z");
  const categoryId = "00000000-0000-4000-8000-000000000010";
  const tagIds = ["00000000-0000-4000-8000-000000000020", "00000000-0000-4000-8000-000000000021"];
  const mediaId = "00000000-0000-4000-8000-000000000030";
  const scheduledByAdministratorId = (await db.select({ id: schema.administrators.id }).from(schema.administrators).limit(1))[0]!.id;
  await db.insert(schema.categories).values({ id: categoryId, name: "工程实践", slug: "engineering", createdAt, updatedAt });
  await db.insert(schema.tags).values([
    { id: tagIds[0], name: "TypeScript", slug: "typescript", createdAt, updatedAt },
    { id: tagIds[1], name: "可迁移", slug: "portable", createdAt, updatedAt },
  ]);
  await db.insert(schema.media).values({
    id: mediaId, sourceKey: `source/${mediaId}.bin`, derivativeKey: `derivative/${mediaId}.png`,
    sourceMimeType: "image/png", derivativeMimeType: "image/png", sourceBytes: 64, derivativeBytes: 32,
    width: 32, height: 18, createdAt,
  });
  const articleRows = [
    { id: "00000000-0000-4000-8000-000000000040", title: "保留草稿", summary: "strict manifest tracer", coverUrl: "https://images.example.test/historic-cover.png", slug: "retained-unicode-draft", markdown: "# 原文\n\n![历史图片](https://images.example.test/historic.png)\n\n<script>alert('never render')</script>\n\n中文 ✅", seoDescription: "source authority", status: "draft", publishedAt: null, scheduledAt, scheduledByAdministratorId, deletedAt: null, createdAt, updatedAt, categoryId, coverMediaId: mediaId, coverAlt: "封面", coverDecorative: false, legacyMediaReview: "review_required" },
    { id: "00000000-0000-4000-8000-000000000041", title: "已发布", summary: "published", coverUrl: "", slug: "retained-published", markdown: "# published", seoDescription: "published source", status: "published", publishedAt, scheduledAt: null, scheduledByAdministratorId: null, deletedAt: null, createdAt, updatedAt, categoryId, coverMediaId: null, coverAlt: "", coverDecorative: false, legacyMediaReview: "clear" },
    { id: "00000000-0000-4000-8000-000000000042", title: "已下线", summary: "unpublished", coverUrl: "", slug: "retained-unpublished", markdown: "# unpublished", seoDescription: "unpublished source", status: "unpublished", publishedAt, scheduledAt: null, scheduledByAdministratorId: null, deletedAt: null, createdAt, updatedAt, categoryId: null, coverMediaId: null, coverAlt: "", coverDecorative: false, legacyMediaReview: "clear" },
    { id: "00000000-0000-4000-8000-000000000043", title: "软删除", summary: "deleted", coverUrl: "", slug: "retained-deleted", markdown: "# deleted", seoDescription: "deleted source", status: "published", publishedAt, scheduledAt: null, scheduledByAdministratorId: null, deletedAt, createdAt, updatedAt, categoryId, coverMediaId: null, coverAlt: "", coverDecorative: false, legacyMediaReview: "clear" },
    { id: "00000000-0000-4000-8000-000000000044", title: "空发布时间", summary: "null publication", coverUrl: "", slug: "retained-null-publication", markdown: "# null publication", seoDescription: "null publication source", status: "published", publishedAt: null, scheduledAt: null, scheduledByAdministratorId: null, deletedAt: null, createdAt, updatedAt, categoryId: null, coverMediaId: null, coverAlt: "", coverDecorative: false, legacyMediaReview: "clear" },
  ] as const;
  await db.insert(schema.articles).values(articleRows);
  await db.insert(schema.articleTags).values([
    { articleId: articleRows[0].id, tagId: tagIds[1] },
    { articleId: articleRows[0].id, tagId: tagIds[0] },
    { articleId: articleRows[3].id, tagId: tagIds[0] },
  ]);
  await db.insert(schema.articleDailyViews).values({
    articleId: articleRows[1].id,
    day: "1999-01-02",
    totalPv: 17,
    directPv: 2,
    internalPv: 3,
    searchPv: 4,
    socialPv: 5,
    externalPv: 3,
  });
  await db.insert(schema.sitePages).values({ id: "00000000-0000-4000-8000-000000000050", key: "about", title: "关于导出", markdown: "# About source", status: "draft", version: updatedAt, createdAt, updatedAt });
  const app = await buildApp({ publicOrigin: origin });
  try {
    const unauthenticated = await app.inject({ method: "POST", url: "/admin/export" });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(unauthenticated.headers["cache-control"], "no-store");

    const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin }, payload: { username, password } });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = sessionCookie(String(login.headers["set-cookie"]));
    for (const requestOrigin of [undefined, "https://wrong.invalid"]) {
      const rejected = await app.inject({ method: "POST", url: "/admin/export", headers: { cookie, ...(requestOrigin ? { origin: requestOrigin } : {}) } });
      assert.equal(rejected.statusCode, 403);
      assert.equal(rejected.headers["cache-control"], "no-store");
    }

    const exported = await app.inject({ method: "POST", url: "/admin/export", headers: { cookie, origin } });
    assert.equal(exported.statusCode, 200, exported.body);
    assert.equal(exported.headers["cache-control"], "no-store");
    assert.equal(exported.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(exported.headers["content-disposition"], 'attachment; filename="blog-x-export-v1.json"');
    const nativeFormExport = await app.inject({
      method: "POST",
      url: "/admin/export",
      headers: { cookie, origin, "content-type": "application/x-www-form-urlencoded" },
      payload: "",
    });
    assert.equal(nativeFormExport.statusCode, 200, nativeFormExport.body);
    assert.equal(nativeFormExport.headers["content-disposition"], 'attachment; filename="blog-x-export-v1.json"');
    const rejectedFormInput = await app.inject({
      method: "POST",
      url: "/admin/export",
      headers: { cookie, origin, "content-type": "application/x-www-form-urlencoded" },
      payload: "unexpected=value",
    });
    assert.equal(rejectedFormInput.statusCode, 400);
    const manifest = portableExportManifestSchema.parse(JSON.parse(JSON.stringify(exported.json())));
    assert.equal(manifest.format, "blog-x-portable-export");
    assert.equal(manifest.version, 1);
    assert.equal(portableExportManifestSchema.safeParse(manifest).success, true, "the legacy portable manifest remains v1-compatible");
    assert.equal(manifest.articles.find((item) => item.id === articleRows[0].id)?.markdown, "# 原文\n\n![历史图片](https://images.example.test/historic.png)\n\n<script>alert('never render')</script>\n\n中文 ✅");
    assert.deepEqual(manifest.articles.find((item) => item.id === articleRows[0].id && item.legacyMediaReview === "review_required"), {
      ...articleRows[0],
      publishedAt: null,
      scheduledAt: scheduledAt.toISOString(),
      deletedAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      tagIds: [tagIds[0], tagIds[1]],
    });
    const oldCompatible = portableExportManifestSchema.parse({
      ...manifest,
      articles: manifest.articles.map(({ legacyMediaReview: _legacyMediaReview, scheduledAt: _scheduledAt, scheduledByAdministratorId: _scheduledByAdministratorId, ...article }) => article),
    });
    assert.equal(oldCompatible.articles[0]?.legacyMediaReview, undefined);
    assert.equal(oldCompatible.articles[0]?.scheduledAt, undefined);
    assert.equal(oldCompatible.articles[0]?.scheduledByAdministratorId, undefined);
    assert.equal(portableExportManifestSchema.safeParse({
      ...manifest,
      articles: manifest.articles.map((article, index) => index === 0 ? { ...article, scheduledByAdministratorId: undefined } : article),
    }).success, false);
    assert.deepEqual(manifest.articles.map((item) => item.id), [...manifest.articles].map((item) => item.id).sort());
    const categoryIds = new Set(manifest.categories.map((item) => item.id));
    const exportedTagIds = new Set(manifest.tags.map((item) => item.id));
    const mediaIds = new Set(manifest.media.map((item) => item.id));
    for (const article of manifest.articles) {
      assert.ok(!article.categoryId || categoryIds.has(article.categoryId), "category references must not dangle");
      assert.ok(!article.coverMediaId || mediaIds.has(article.coverMediaId), "media references must not dangle");
      for (const tagId of article.tagIds) assert.ok(exportedTagIds.has(tagId), "tag references must not dangle");
    }
    const [sourceArticles, sourceCategories, sourceTags, sourceRelations, sourceMedia, sourceAbout] = await Promise.all([
      db.select().from(schema.articles), db.select().from(schema.categories), db.select().from(schema.tags),
      db.select().from(schema.articleTags), db.select().from(schema.media), db.select().from(schema.sitePages),
    ]);
    const sourceTagIds = new Map<string, string[]>();
    for (const relation of sourceRelations) (sourceTagIds.get(relation.articleId) ?? sourceTagIds.set(relation.articleId, []).get(relation.articleId)!).push(relation.tagId);
    const sourceMap = {
      articles: sourceArticles.map((item) => ({ ...item, publishedAt: item.publishedAt?.toISOString() ?? null, scheduledAt: item.scheduledAt?.toISOString() ?? null, deletedAt: item.deletedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), tagIds: (sourceTagIds.get(item.id) ?? []).sort() })).sort((left, right) => left.id.localeCompare(right.id)),
      categories: sourceCategories.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })).sort((left, right) => left.id.localeCompare(right.id)),
      tags: sourceTags.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })).sort((left, right) => left.id.localeCompare(right.id)),
      media: sourceMedia.map((item) => ({ id: item.id, width: item.width, height: item.height, mimeType: item.derivativeMimeType, createdAt: item.createdAt.toISOString() })).sort((left, right) => left.id.localeCompare(right.id)),
      about: sourceAbout[0] && { ...sourceAbout[0], version: sourceAbout[0].version.toISOString(), createdAt: sourceAbout[0].createdAt.toISOString(), updatedAt: sourceAbout[0].updatedAt.toISOString() },
    };
    const reconstructed = {
      articles: manifest.articles.map((item) => ({ ...item, tagIds: [...item.tagIds].sort() })),
      categories: manifest.categories,
      tags: manifest.tags,
      media: manifest.media,
      about: manifest.about,
    };
    assert.deepEqual(reconstructed, sourceMap, "independent normalized source maps must equal the strict reparsed archive");
    assert.doesNotMatch(JSON.stringify(manifest), /(?:article_daily_views|totalPv|directPv|internalPv|searchPv|socialPv|externalPv|1999-01-02|sourceKey|derivativeKey|source_key|derivative_key|source\/|derivative\/|renderedHtml|base64|blob:|file:|password|session|postgres|127\.0\.0\.1|124\.222|47\.99)/i);
    assert.equal(app.hasRoute({ method: "POST", url: "/admin/export" }), true);
    assert.equal(app.hasRoute({ method: "GET", url: "/admin/export" }), false);
    assert.equal(app.hasRoute({ method: "POST", url: "/public/export" }), false);
    assert.equal(app.hasRoute({ method: "POST", url: "/admin/import" }), false);
  } finally {
    await app.close();
    await pool.query("truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
    await pool.end();
  }
});
