import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { articleActions, articleStatuses, resolveArticleTransition } from "../src/content/article-state.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, articles, sessions } from "../src/db/schema.js";

const databaseUrl = process.env.LIFECYCLE_TEST_DATABASE_URL;
const publicOrigin = "http://127.0.0.1:3100";

function sessionCookie(setCookie: string) {
  const match = /^blog_x_session=([^;]+)/.exec(setCookie);
  assert.ok(match, "login must issue a session cookie");
  return `blog_x_session=${match[1]}`;
}

test("the complete article state/action table allows only explicit lifecycle transitions", () => {
  const expected = {
    draft: { edit: "draft", publish: "published", unpublish: null, republish: null, delete: "deleted" },
    published: { edit: "published", publish: null, unpublish: "unpublished", republish: null, delete: "deleted" },
    unpublished: { edit: "unpublished", publish: null, unpublish: null, republish: "published", delete: "deleted" },
    deleted: { edit: null, publish: null, unpublish: null, republish: null, delete: null },
  } as const;

  for (const status of articleStatuses) {
    for (const action of articleActions) assert.equal(resolveArticleTransition(status, action), expected[status][action]);
  }
});

test("publish, edit, slug confirmation, unpublish, republish, and soft delete are atomic and recoverable", async (context) => {
  if (!databaseUrl) {
    context.skip("LIFECYCLE_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, sessions } });
  const username = `lifecycle-test-${Date.now()}`;
  const password = "lifecycle-test-password";
  await pool.query("truncate table sessions, articles, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, articles, administrators cascade");
    await pool.end();
  });
  await seedAdministrator(db, { username, password });

  const app = await buildApp({ publicOrigin });
  context.after(async () => { await app.close(); });
  const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin: publicOrigin, "content-type": "application/json" }, payload: { username, password } });
  const cookie = sessionCookie(String(login.headers["set-cookie"]));
  const headers = { origin: publicOrigin, cookie, "content-type": "application/json" };

  const rejectedLegacyPublish = await app.inject({
    method: "POST",
    url: "/articles/publish",
    headers,
    payload: { title: "Unsafe legacy publish", slug: `unsafe-legacy-${Date.now()}`, markdown: "![Remote](http://images.example.test/legacy.png)" },
  });
  assert.equal(rejectedLegacyPublish.statusCode, 400);
  assert.deepEqual(rejectedLegacyPublish.json(), {
    error: "validation_failed",
    fields: { markdown: ["图片只能使用已上传媒体的 /media/<uuid> 地址"] },
  });

  const unauthorized = await app.inject({ method: "POST", url: "/admin/posts/00000000-0000-4000-8000-000000000000/publish", headers: { origin: publicOrigin } });
  assert.equal(unauthorized.statusCode, 401);
  const rejectedOrigin = await app.inject({ method: "POST", url: "/admin/posts/00000000-0000-4000-8000-000000000000/publish", headers: { ...headers, origin: "https://untrusted.invalid" }, payload: {} });
  assert.equal(rejectedOrigin.statusCode, 403);

  const invalidRow = await db.insert(articles).values({ title: " ", slug: `invalid-${Date.now()}`, markdown: " ", status: "draft" }).returning({ id: articles.id });
  const invalidPublish = await app.inject({ method: "POST", url: `/admin/posts/${invalidRow[0]!.id}/publish`, headers, payload: {} });
  assert.equal(invalidPublish.statusCode, 400);
  assert.equal(invalidPublish.json().error, "validation_failed");
  assert.deepEqual(Object.keys(invalidPublish.json().fields).sort(), ["markdown", "title"]);
  const invalidAfter = await db.select().from(articles).where(eq(articles.id, invalidRow[0]!.id));
  assert.equal(invalidAfter[0]?.status, "draft");
  assert.equal(invalidAfter[0]?.publishedAt, null);
  await db.update(articles).set({ deletedAt: new Date() }).where(eq(articles.id, invalidRow[0]!.id));

  const explicitPublishedAt = "2026-08-01T02:30:00.000Z";
  const slug = `lifecycle-${Date.now()}`;
  const draftInput = {
    title: "Lifecycle article",
    summary: "Lifecycle summary",
    coverUrl: "",
    slug,
    markdown: "# Lifecycle\n\nOriginal source",
    publishedAt: explicitPublishedAt,
    seoDescription: "Lifecycle SEO",
  };
  const draft = await app.inject({ method: "POST", url: "/admin/posts", headers, payload: draftInput });
  assert.equal(draft.statusCode, 201, draft.body);

  const directStateTamper = await app.inject({ method: "PUT", url: `/admin/posts/${draft.json().id}`, headers, payload: { ...draftInput, status: "published", deletedAt: new Date().toISOString() } });
  assert.equal(directStateTamper.statusCode, 400);
  const stillDraft = await app.inject({ method: "GET", url: `/admin/posts/${draft.json().id}`, headers: { cookie } });
  assert.equal(stillDraft.json().status, "draft");

  const published = await app.inject({ method: "POST", url: `/admin/posts/${draft.json().id}/publish`, headers, payload: {} });
  assert.equal(published.statusCode, 200);
  assert.equal(published.json().status, "published");
  assert.equal(published.json().publishedAt, explicitPublishedAt);
  assert.equal((await app.inject({ method: "GET", url: `/public/articles/${slug}` })).statusCode, 200);

  const unsafePublishedEdit = await app.inject({
    method: "PUT",
    url: `/admin/posts/${draft.json().id}`,
    headers,
    payload: { ...draftInput, markdown: "![Remote](https://images.example.test/update.png)" },
  });
  assert.equal(unsafePublishedEdit.statusCode, 400);
  assert.deepEqual(unsafePublishedEdit.json().fields, { markdown: ["图片只能使用已上传媒体的 /media/<uuid> 地址"] });
  assert.equal((await app.inject({ method: "GET", url: `/admin/posts/${draft.json().id}`, headers: { cookie } })).json().markdown, draftInput.markdown);

  const ordinaryEditInput = { ...draftInput, title: "Ordinary edit", publishedAt: "2026-08-02T02:30:00.000Z", publishedAtCorrection: false };
  const ordinaryEdit = await app.inject({ method: "PUT", url: `/admin/posts/${draft.json().id}`, headers, payload: ordinaryEditInput });
  assert.equal(ordinaryEdit.statusCode, 200);
  assert.equal(ordinaryEdit.json().publishedAt, explicitPublishedAt);
  assert.equal(ordinaryEdit.json().status, "published");
  assert.notEqual(ordinaryEdit.json().version, published.json().version);

  const changedSlug = `${slug}-changed`;
  const noConfirmation = await app.inject({ method: "PUT", url: `/admin/posts/${draft.json().id}`, headers, payload: { ...ordinaryEditInput, slug: changedSlug } });
  assert.equal(noConfirmation.statusCode, 409);
  assert.deepEqual(noConfirmation.json(), { error: "published_slug_confirmation_required", currentSlug: slug, requestedSlug: changedSlug, version: ordinaryEdit.json().version });
  const unchanged = await app.inject({ method: "GET", url: `/admin/posts/${draft.json().id}`, headers: { cookie } });
  assert.equal(unchanged.json().slug, slug);

  const wrongConfirmation = await app.inject({
    method: "PUT",
    url: `/admin/posts/${draft.json().id}`,
    headers,
    payload: { ...ordinaryEditInput, slug: changedSlug, slugChangeConfirmation: { articleId: draft.json().id, currentSlug: slug, version: draft.json().version } },
  });
  assert.equal(wrongConfirmation.statusCode, 409);

  const reservedSlug = `reserved-lifecycle-${Date.now()}`;
  const reserved = await app.inject({ method: "POST", url: "/admin/posts", headers, payload: { ...draftInput, slug: reservedSlug, publishedAt: null } });
  assert.equal(reserved.statusCode, 201);
  const reservedPublish = await app.inject({ method: "POST", url: `/admin/posts/${reserved.json().id}/publish`, headers, payload: {} });
  assert.equal(reservedPublish.statusCode, 200);
  assert.match(reservedPublish.json().publishedAt, /^\d{4}-\d{2}-\d{2}T/);
  const reservedDelete = await app.inject({ method: "POST", url: `/admin/posts/${reserved.json().id}/delete`, headers, payload: {} });
  assert.equal(reservedDelete.statusCode, 200);
  const reservedConflict = await app.inject({
    method: "PUT",
    url: `/admin/posts/${draft.json().id}`,
    headers,
    payload: { ...ordinaryEditInput, slug: reservedSlug, slugChangeConfirmation: { articleId: draft.json().id, currentSlug: slug, version: ordinaryEdit.json().version } },
  });
  assert.equal(reservedConflict.statusCode, 409);
  assert.equal(reservedConflict.json().error, "slug_conflict");

  const confirmedChange = await app.inject({
    method: "PUT",
    url: `/admin/posts/${draft.json().id}`,
    headers,
    payload: { ...ordinaryEditInput, slug: changedSlug, slugChangeConfirmation: { articleId: draft.json().id, currentSlug: slug, version: ordinaryEdit.json().version } },
  });
  assert.equal(confirmedChange.statusCode, 200);
  assert.equal(confirmedChange.json().slug, changedSlug);
  assert.equal(confirmedChange.json().publishedAt, explicitPublishedAt);

  const correctedPublishedAt = "2026-07-31T01:15:00.000Z";
  const correction = await app.inject({
    method: "PUT",
    url: `/admin/posts/${draft.json().id}`,
    headers,
    payload: { ...ordinaryEditInput, slug: changedSlug, publishedAt: correctedPublishedAt, publishedAtCorrection: true },
  });
  assert.equal(correction.statusCode, 200);
  assert.equal(correction.json().publishedAt, correctedPublishedAt);

  const unpublished = await app.inject({ method: "POST", url: `/admin/posts/${draft.json().id}/unpublish`, headers, payload: {} });
  assert.equal(unpublished.statusCode, 200);
  assert.equal(unpublished.json().status, "unpublished");
  assert.equal(unpublished.json().publishedAt, correctedPublishedAt);
  assert.equal((await app.inject({ method: "GET", url: `/public/articles/${changedSlug}` })).statusCode, 404);
  const repeatedUnpublish = await app.inject({ method: "POST", url: `/admin/posts/${draft.json().id}/unpublish`, headers, payload: {} });
  assert.equal(repeatedUnpublish.statusCode, 409);
  assert.equal(repeatedUnpublish.json().error, "invalid_transition");

  await db.update(articles).set({ markdown: "![Remote](https://images.example.test/republish.png)" }).where(eq(articles.id, draft.json().id));
  const rejectedRepublish = await app.inject({ method: "POST", url: `/admin/posts/${draft.json().id}/republish`, headers, payload: {} });
  assert.equal(rejectedRepublish.statusCode, 400);
  assert.deepEqual(rejectedRepublish.json().fields, { markdown: ["图片只能使用已上传媒体的 /media/<uuid> 地址"] });
  await db.update(articles).set({ markdown: draftInput.markdown }).where(eq(articles.id, draft.json().id));

  const republished = await app.inject({ method: "POST", url: `/admin/posts/${draft.json().id}/republish`, headers, payload: {} });
  assert.equal(republished.statusCode, 200);
  assert.equal(republished.json().status, "published");
  assert.equal(republished.json().publishedAt, correctedPublishedAt);
  assert.equal((await app.inject({ method: "GET", url: `/public/articles/${changedSlug}` })).statusCode, 200);

  const deleted = await app.inject({ method: "POST", url: `/admin/posts/${draft.json().id}/delete`, headers, payload: {} });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.json(), { id: draft.json().id, deleted: true });
  assert.equal((await app.inject({ method: "GET", url: `/admin/posts/${draft.json().id}`, headers: { cookie } })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: `/admin/posts/${draft.json().id}/republish`, headers, payload: {} })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: `/public/articles/${changedSlug}` })).statusCode, 404);
  const retained = await db.select().from(articles).where(eq(articles.id, draft.json().id));
  assert.equal(retained.length, 1);
  assert.equal(retained[0]?.slug, changedSlug);
  assert.equal(retained[0]?.markdown, draftInput.markdown);
  assert.ok(retained[0]?.deletedAt);
  const retainedList = await app.inject({ method: "GET", url: "/admin/posts", headers: { cookie } });
  assert.equal(retainedList.statusCode, 200);
  assert.equal(retainedList.json().some((post: { id: string }) => post.id === draft.json().id), false);
});
