import assert from "node:assert/strict";
import test from "node:test";
import { articleRevisionDetailSchema, articleRevisionListSchema } from "@blog-x/contracts";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createAdminPostRepository } from "../src/content/admin-repository.js";
import { createArticleService } from "../src/content/article-service.js";
import * as schema from "../src/db/schema.js";

const databaseUrl = process.env.LIFECYCLE_TEST_DATABASE_URL;

test("revision lists expose newest-first content-free summaries", () => {
  assert.deepEqual(articleRevisionListSchema.parse([{ id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-01-01T00:00:00.000Z", sourceVersion: "2026-01-01T00:00:00.000Z", changedFields: ["title"] }]), [{ id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-01-01T00:00:00.000Z", sourceVersion: "2026-01-01T00:00:00.000Z", changedFields: ["title"] }]);
});

test("revision detail is strict and only exposes the selected article snapshot", () => {
  const detail = {
    revision: {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-01-01T00:00:00.000Z",
      sourceVersion: "2026-01-01T00:00:00.000Z",
      changedFields: ["title"],
      snapshot: {
        title: "之前的标题", summary: "摘要", coverUrl: "", slug: "before", markdown: "# before",
        publishedAt: null, seoDescription: "", categoryId: null, tagIds: [], status: "draft",
      },
    },
    current: {
      id: "22222222-2222-4222-8222-222222222222", title: "现在的标题", summary: "摘要", coverUrl: "", slug: "now", markdown: "# now",
      publishedAt: null, seoDescription: "", categoryId: null, tagIds: [], status: "draft", legacyMediaReview: "clear", scheduledAt: null, version: "2026-01-02T00:00:00.000Z",
    },
    changedFields: ["title"],
  };
  assert.equal(articleRevisionDetailSchema.safeParse(detail).success, true);
  assert.equal(articleRevisionDetailSchema.safeParse({ ...detail, leaked: "no" }).success, false);
});

test("restoring a revision uses a version guard, preserves slug continuity, and writes content-free recovery evidence", async (context) => {
  if (!databaseUrl) {
    context.skip("LIFECYCLE_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  await pool.query("truncate table audit_events, article_revisions, article_slug_redirects, article_tags, articles, administrators cascade");
  context.after(async () => { await pool.query("truncate table audit_events, article_revisions, article_slug_redirects, article_tags, articles, administrators cascade"); await pool.end(); });

  const initialAt = new Date("2026-09-18T00:00:00.000Z");
  const [administrator] = await db.insert(schema.administrators).values({ username: `revisions-${Date.now()}`, passwordHash: "test" }).returning({ id: schema.administrators.id });
  const [article] = await db.insert(schema.articles).values({
    title: "历史标题", summary: "", coverUrl: "", slug: "history-old", markdown: "# old", seoDescription: "",
    status: "published", publishedAt: initialAt, updatedAt: initialAt, legacyMediaReview: "clear",
  }).returning();
  assert.ok(administrator && article);
  const service = createArticleService(createAdminPostRepository(db));
  const updated = await service.updateDraft(article.id, {
    title: "当前标题", summary: "", coverUrl: "", slug: "history-new", markdown: "# new", publishedAt: initialAt.toISOString(),
    seoDescription: "", categoryId: null, tagIds: [], publishedAtCorrection: false,
    slugChangeConfirmation: { articleId: article.id, currentSlug: "history-old", version: initialAt.toISOString() },
  }, administrator.id);
  assert.equal(updated.ok, true);
  if (!updated.ok) return;

  const revisions = await service.listRevisions(article.id);
  assert.equal(revisions?.length, 1);
  assert.deepEqual(Object.keys(revisions?.[0] ?? {}).sort(), ["changedFields", "createdAt", "id", "sourceVersion"]);
  const revisionId = revisions?.[0]?.id;
  assert.ok(revisionId);
  const detail = await service.revisionDetail(article.id, revisionId);
  assert.equal(detail?.revision.snapshot.markdown, "# old");
  assert.deepEqual(detail?.changedFields, ["title", "slug", "markdown"]);

  const stale = await service.restoreRevision(article.id, revisionId, initialAt.toISOString(), administrator.id);
  assert.deepEqual(stale, { ok: false, detail: { error: "stale_version" } });
  assert.equal((await service.getDraft(article.id))?.slug, "history-new");
  assert.equal((await db.select().from(schema.articleRevisions)).length, 1);

  const restored = await service.restoreRevision(article.id, revisionId, updated.post.version, administrator.id);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.post.status, "draft");
  assert.equal(restored.post.publishedAt, null);
  assert.equal(restored.post.scheduledAt, null);
  assert.equal(restored.post.slug, "history-old");
  assert.equal((await db.select().from(schema.articleSlugRedirects)).some((row) => row.fromSlug === "history-new" && row.articleId === article.id), true);
  const audit = (await db.select().from(schema.auditEvents).orderBy(schema.auditEvents.occurredAt)).at(-1);
  assert.equal(audit?.event, "article.revision.restored");
  assert.deepEqual(Object.keys((audit?.metadata ?? {}) as Record<string, unknown>).sort(), ["changedFields", "previousStatus", "revisionId", "status"]);
  assert.equal(JSON.stringify(audit?.metadata).includes("# old"), false);
  assert.equal(JSON.stringify(audit?.metadata).includes("# new"), false);
});
