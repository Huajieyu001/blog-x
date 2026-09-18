import assert from "node:assert/strict";
import test from "node:test";
import { publicArticleRedirectResponseSchema } from "@blog-x/contracts";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createAdminPostRepository } from "../src/content/admin-repository.js";
import { createArticleService } from "../src/content/article-service.js";
import { createPublicRepository } from "../src/content/public-repository.js";
import { administrators, articleSlugRedirects, articles } from "../src/db/schema.js";

const databaseUrl = process.env.LIFECYCLE_TEST_DATABASE_URL;

test("a public article redirect response has one canonical root-relative location", () => {
  assert.deepEqual(
    publicArticleRedirectResponseSchema.parse({ location: "/public/articles/current-slug" }),
    { location: "/public/articles/current-slug" },
  );
});

test("published aliases stay direct, private targets stay invisible, and history cannot be reused", async (context) => {
  if (!databaseUrl) {
    context.skip("LIFECYCLE_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, articleSlugRedirects } });
  await pool.query("truncate table audit_events, article_slug_redirects, articles, administrators cascade");
  context.after(async () => { await pool.query("truncate table audit_events, article_slug_redirects, articles, administrators cascade"); await pool.end(); });

  const now = new Date("2026-09-18T00:00:00.000Z");
  const [administrator] = await db.insert(administrators).values({ username: `redirect-${Date.now()}`, passwordHash: "test" }).returning({ id: administrators.id });
  const [article] = await db.insert(articles).values({ title: "Redirect", summary: "", coverUrl: "", slug: "slug-a", markdown: "# Redirect", seoDescription: "", status: "published", publishedAt: now, updatedAt: now, legacyMediaReview: "clear" }).returning();
  assert.ok(administrator && article);
  const service = createArticleService(createAdminPostRepository(db));
  const publicRepository = createPublicRepository(db);
  const input = (slug: string, currentSlug: string, version: string) => ({
    title: article.title, summary: article.summary, coverUrl: "", slug, markdown: article.markdown, publishedAt: now.toISOString(), seoDescription: "", categoryId: null, tagIds: [],
    slugChangeConfirmation: { articleId: article.id, currentSlug, version },
  });
  const first = await service.updateDraft(article.id, input("slug-b", "slug-a", article.updatedAt.toISOString()), administrator.id);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = await service.updateDraft(article.id, input("slug-c", "slug-b", first.post.version), administrator.id);
  assert.equal(second.ok, true);
  const a = await publicRepository.findDetailBySlug("slug-a");
  const b = await publicRepository.findDetailBySlug("slug-b");
  assert.deepEqual(a, { kind: "redirect", location: "/public/articles/slug-c" });
  assert.deepEqual(b, { kind: "redirect", location: "/public/articles/slug-c" });

  const privateResult = await service.transition(article.id, "unpublish", administrator.id);
  assert.equal(privateResult.ok, true);
  assert.equal(await publicRepository.findDetailBySlug("slug-a"), null);
  assert.equal(await publicRepository.findDetailBySlug("slug-c"), null);
  const republished = await service.transition(article.id, "republish", administrator.id);
  assert.equal(republished.ok, true);
  if (!republished.ok || "deleted" in republished) return;

  // Returning to an owned historical name removes only that alias. Every other
  // alias still resolves directly to the new current slug, never through A -> B.
  const returned = await service.updateDraft(article.id, input("slug-a", "slug-c", republished.post.version), administrator.id);
  assert.equal(returned.ok, true);
  assert.deepEqual(await publicRepository.findDetailBySlug("slug-b"), { kind: "redirect", location: "/public/articles/slug-a" });
  assert.deepEqual(await publicRepository.findDetailBySlug("slug-c"), { kind: "redirect", location: "/public/articles/slug-a" });

  const deleteResult = await service.transition(article.id, "delete", administrator.id);
  assert.equal(deleteResult.ok, true);
  assert.equal(await publicRepository.findDetailBySlug("slug-b"), null);
  assert.equal(await publicRepository.findDetailBySlug("slug-a"), null);
  const restored = await service.restoreDeleted(article.id, administrator.id);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  const scheduled = await service.schedule(article.id, { scheduledAt: "2099-01-01T00:00:00.000Z" }, administrator.id);
  assert.equal(scheduled.ok, true);
  assert.equal(await publicRepository.findDetailBySlug("slug-b"), null);
  assert.equal(await publicRepository.findDetailBySlug("slug-a"), null);

  await assert.rejects(
    createArticleService(createAdminPostRepository(db)).createDraft({ title: "Collision", summary: "", coverUrl: "", slug: "slug-a", markdown: "# Collision", publishedAt: null, seoDescription: "", categoryId: null, tagIds: [] }, administrator.id),
    /reserved/i,
  );

  const concurrentInput = { title: "Concurrent", summary: "", coverUrl: "", slug: "only-one-wins", markdown: "# Concurrent", publishedAt: null, seoDescription: "", categoryId: null, tagIds: [] };
  const attempts = await Promise.allSettled([
    createArticleService(createAdminPostRepository(db)).createDraft(concurrentInput, administrator.id),
    createArticleService(createAdminPostRepository(db)).createDraft(concurrentInput, administrator.id),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled" && attempt.value.ok).length, 1);
});
