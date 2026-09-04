import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { articleActions, articleStatuses, resolveArticleTransition } from "../src/content/article-state.js";
import { classifyRetainedLegacyMedia } from "../src/ops/legacy-media-migration.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, articles, media, sessions } from "../src/db/schema.js";

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

test("legacy media classification is transactional, idempotent, and lossless", async (context) => {
  if (!databaseUrl) {
    context.skip("LIFECYCLE_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { articles, media, sessions } });
  await pool.query("truncate table sessions, articles cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, articles cascade");
    await pool.end();
  });
  const timestamp = new Date("2026-08-09T12:00:00.000Z");
  const mediaId = "99999999-9999-4999-8999-999999999999";
  const unsafeMarkdown = [
    "![Remote](https://images.example.test/legacy.png)",
    "[External documentation](https://docs.example.test/guide)",
    "```markdown",
    "![Code lookalike](https://images.example.test/code.png)",
    "```",
  ].join("\n\n");
  await db.insert(media).values({
    id: mediaId,
    sourceKey: `source/${mediaId}.bin`, derivativeKey: `derivative/${mediaId}.png`,
    sourceMimeType: "image/png", derivativeMimeType: "image/png", sourceBytes: 1, derivativeBytes: 1,
    width: 1, height: 1, createdAt: timestamp,
  });
  await db.insert(articles).values([
    { id: "77777777-7777-4777-8777-777777777777", title: "unsafe", slug: "legacy-unsafe", markdown: unsafeMarkdown, coverUrl: "https://images.example.test/legacy-cover.png", status: "published", publishedAt: timestamp, createdAt: timestamp, updatedAt: timestamp },
    { id: "88888888-8888-4888-8888-888888888888", title: "covered", slug: "legacy-covered", markdown: "# preserved", coverUrl: "https://images.example.test/replaced-cover.png", coverMediaId: mediaId, coverAlt: "Authoritative cover", status: "published", publishedAt: timestamp, createdAt: timestamp, updatedAt: timestamp },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "deleted", slug: "legacy-deleted", markdown: unsafeMarkdown, coverUrl: "https://images.example.test/deleted-cover.png", status: "published", publishedAt: timestamp, deletedAt: timestamp, createdAt: timestamp, updatedAt: timestamp },
  ]);

  const first = await classifyRetainedLegacyMedia(pool);
  assert.equal(first.changed, 2);
  const firstRows = await db.select().from(articles);
  const unsafe = firstRows.find((article) => article.slug === "legacy-unsafe");
  const covered = firstRows.find((article) => article.slug === "legacy-covered");
  const deleted = firstRows.find((article) => article.slug === "legacy-deleted");
  assert.equal(unsafe?.legacyMediaReview, "review_required");
  assert.equal(unsafe?.markdown, unsafeMarkdown);
  assert.equal(unsafe?.coverUrl, "https://images.example.test/legacy-cover.png");
  assert.equal(unsafe?.updatedAt.toISOString(), timestamp.toISOString());
  assert.equal(covered?.legacyMediaReview, "clear");
  assert.equal(covered?.markdown, "# preserved");
  assert.equal(covered?.coverUrl, "");
  assert.equal(covered?.updatedAt.toISOString(), timestamp.toISOString());
  assert.equal(deleted?.legacyMediaReview, "pending");
  assert.equal(deleted?.markdown, unsafeMarkdown);
  assert.equal(deleted?.coverUrl, "https://images.example.test/deleted-cover.png");

  const beforeSecondRun = JSON.stringify(firstRows.map((article) => ({ ...article, createdAt: article.createdAt.toISOString(), updatedAt: article.updatedAt.toISOString(), publishedAt: article.publishedAt?.toISOString(), deletedAt: article.deletedAt?.toISOString() })));
  const second = await classifyRetainedLegacyMedia(pool);
  const secondRows = await db.select().from(articles);
  assert.equal(second.changed, 0);
  assert.equal(JSON.stringify(secondRows.map((article) => ({ ...article, createdAt: article.createdAt.toISOString(), updatedAt: article.updatedAt.toISOString(), publishedAt: article.publishedAt?.toISOString(), deletedAt: article.deletedAt?.toISOString() }))), beforeSecondRun);
});

test("scheduled publication schema preserves legacy draft publication timestamps and rejects invalid retained schedule state", async (context) => {
  if (!databaseUrl) {
    context.skip("LIFECYCLE_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prefix = `schedule-schema-${Date.now()}`;
  const administratorId = "00000000-0000-4000-8000-000000000001";
  const scheduledAt = "2026-12-01T02:15:30.000Z";
  const legacyPublishedAt = "2030-01-01T00:00:00.000Z";
  context.after(async () => {
    await pool.query("delete from articles where slug like $1", [`${prefix}%`]);
    await pool.end();
  });

  const columns = await pool.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = any($1) order by column_name",
    [["scheduled_at", "scheduled_by_administrator_id"]],
  );
  assert.deepEqual(columns.rows.map((row) => row.column_name), ["scheduled_at", "scheduled_by_administrator_id"]);
  const constraints = await pool.query<{ conname: string }>(
    "select conname from pg_constraint where conrelid = 'articles'::regclass and conname = any($1) order by conname",
    [["articles_schedule_draft_check", "articles_schedule_pair_check"]],
  );
  assert.deepEqual(constraints.rows.map((row) => row.conname), ["articles_schedule_draft_check", "articles_schedule_pair_check"]);
  const dueIndex = await pool.query<{ indexname: string }>(
    "select indexname from pg_indexes where schemaname = 'public' and tablename = 'articles' and indexname = 'articles_schedule_due_index'",
  );
  assert.equal(dueIndex.rowCount, 1);

  await pool.query(
    "insert into articles (title, slug, markdown, status, published_at) values ($1, $2, $3, 'draft', $4)",
    ["Legacy draft", `${prefix}-legacy`, "# Legacy", legacyPublishedAt],
  );
  const retained = await pool.query<{ published_at: Date; scheduled_at: Date | null; scheduled_by_administrator_id: string | null }>(
    "select published_at, scheduled_at, scheduled_by_administrator_id from articles where slug = $1",
    [`${prefix}-legacy`],
  );
  assert.equal(retained.rows[0]?.published_at.toISOString(), legacyPublishedAt);
  assert.equal(retained.rows[0]?.scheduled_at, null);
  assert.equal(retained.rows[0]?.scheduled_by_administrator_id, null);

  await assert.rejects(
    pool.query(
      "insert into articles (title, slug, markdown, status, scheduled_at) values ($1, $2, $3, 'draft', $4)",
      ["Partial schedule", `${prefix}-partial`, "# Partial", scheduledAt],
    ),
    (error: { code?: string; constraint?: string }) => error.code === "23514" && error.constraint === "articles_schedule_pair_check",
  );
  await assert.rejects(
    pool.query(
      "insert into articles (title, slug, markdown, status, scheduled_at, scheduled_by_administrator_id) values ($1, $2, $3, 'published', $4, $5)",
      ["Published schedule", `${prefix}-published`, "# Published", scheduledAt, administratorId],
    ),
    (error: { code?: string; constraint?: string }) => error.code === "23514" && error.constraint === "articles_schedule_draft_check",
  );
  await assert.rejects(
    pool.query(
      "insert into articles (title, slug, markdown, status, deleted_at, scheduled_at, scheduled_by_administrator_id) values ($1, $2, $3, 'draft', now(), $4, $5)",
      ["Deleted schedule", `${prefix}-deleted`, "# Deleted", scheduledAt, administratorId],
    ),
    (error: { code?: string; constraint?: string }) => error.code === "23514" && error.constraint === "articles_schedule_draft_check",
  );
});

test("a retained draft schedule is authenticated, future-only, row-locked, and content-free audited", async (context) => {
  if (!databaseUrl) {
    context.skip("LIFECYCLE_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, articles, sessions } });
  const username = `schedule-lifecycle-${Date.now()}`;
  const password = "schedule-lifecycle-password";
  await pool.query("truncate table audit_events, sessions, articles, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table audit_events, sessions, articles, administrators cascade");
    await pool.end();
  });
  await seedAdministrator(db, { username, password });
  const administrator = (await db.select({ id: administrators.id }).from(administrators).limit(1))[0]!;
  const app = await buildApp({ publicOrigin });
  context.after(async () => { await app.close(); });
  const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin: publicOrigin, "content-type": "application/json" }, payload: { username, password } });
  const cookie = sessionCookie(String(login.headers["set-cookie"]));
  const headers = { origin: publicOrigin, cookie, "content-type": "application/json" };
  const draftInput = {
    title: "Scheduled lifecycle article", summary: "Scheduled lifecycle summary", coverUrl: "", slug: `scheduled-lifecycle-${Date.now()}`,
    markdown: "# Scheduled lifecycle\n\nContent must never enter audit metadata", publishedAt: null, seoDescription: "Scheduled lifecycle SEO",
  };
  const created = await app.inject({ method: "POST", url: "/admin/posts", headers, payload: draftInput });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id as string;
  const auditCount = async () => Number((await pool.query("select count(*)::int as count from audit_events where target_id = $1", [id])).rows[0]?.count ?? 0);
  assert.equal(await auditCount(), 1);

  const unauthorized = await app.inject({ method: "PUT", url: `/admin/posts/${id}/schedule`, headers: { "content-type": "application/json" }, payload: { scheduledAt: "2032-01-01T00:00:00.000Z" } });
  assert.equal(unauthorized.statusCode, 401);
  const wrongOrigin = await app.inject({ method: "PUT", url: `/admin/posts/${id}/schedule`, headers: { ...headers, origin: "https://untrusted.invalid" }, payload: { scheduledAt: "2032-01-01T00:00:00.000Z" } });
  assert.equal(wrongOrigin.statusCode, 403);
  const malformed = await app.inject({ method: "PUT", url: `/admin/posts/${id}/schedule`, headers, payload: { scheduledAt: "2032-01-01T00:00:00", extra: true } });
  assert.equal(malformed.statusCode, 400);
  const past = await app.inject({ method: "PUT", url: `/admin/posts/${id}/schedule`, headers, payload: { scheduledAt: "2000-01-01T00:00:00.000Z" } });
  assert.equal(past.statusCode, 400);
  assert.equal(await auditCount(), 1, "rejected schedule attempts must not write audit evidence");

  const firstAt = "2032-01-01T00:00:00.000Z";
  const scheduled = await app.inject({ method: "PUT", url: `/admin/posts/${id}/schedule`, headers, payload: { scheduledAt: firstAt } });
  assert.equal(scheduled.statusCode, 200, scheduled.body);
  assert.equal(scheduled.json().status, "draft");
  assert.equal(scheduled.json().publishedAt, null, "a pending schedule is never a publication timestamp");
  assert.equal(scheduled.json().scheduledAt, firstAt);

  const secondAt = "2032-01-02T00:00:00.000Z";
  const rescheduled = await app.inject({ method: "PUT", url: `/admin/posts/${id}/schedule`, headers, payload: { scheduledAt: secondAt } });
  assert.equal(rescheduled.statusCode, 200, rescheduled.body);
  assert.equal(rescheduled.json().scheduledAt, secondAt);
  const cancelled = await app.inject({ method: "DELETE", url: `/admin/posts/${id}/schedule`, headers: { origin: publicOrigin, cookie } });
  assert.equal(cancelled.statusCode, 200, cancelled.body);
  assert.equal(cancelled.json().scheduledAt, null);
  const repeatedCancel = await app.inject({ method: "DELETE", url: `/admin/posts/${id}/schedule`, headers: { origin: publicOrigin, cookie } });
  assert.equal(repeatedCancel.statusCode, 409);
  assert.deepEqual(repeatedCancel.json(), { error: "schedule_conflict", status: "draft", reason: "not_scheduled" });

  const events = await pool.query<{ event: string; actor_administrator_id: string; metadata: Record<string, unknown> }>(
    "select event, actor_administrator_id, metadata from audit_events where target_id = $1 order by occurred_at, id", [id],
  );
  assert.deepEqual(events.rows.map((row) => row.event), ["article.created", "article.scheduled", "article.rescheduled", "article.schedule_cancelled"]);
  for (const event of events.rows.slice(1)) {
    assert.equal(event.actor_administrator_id, administrator.id);
    assert.deepEqual(Object.keys(event.metadata), ["scheduledAt"]);
    assert.doesNotMatch(JSON.stringify(event.metadata), /Scheduled lifecycle|Content must never/);
  }

  const manuallyScheduled = await app.inject({ method: "PUT", url: `/admin/posts/${id}/schedule`, headers, payload: { scheduledAt: "2032-01-03T00:00:00.000Z" } });
  assert.equal(manuallyScheduled.statusCode, 200);
  const manuallyPublished = await app.inject({ method: "POST", url: `/admin/posts/${id}/publish`, headers, payload: {} });
  assert.equal(manuallyPublished.statusCode, 200, manuallyPublished.body);
  assert.equal(manuallyPublished.json().scheduledAt, null, "manual publication clears retained schedule authority under the same lock");
  assert.match(manuallyPublished.json().publishedAt, /^\d{4}-\d{2}-\d{2}T/);
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
  await pool.query("truncate table audit_events, sessions, articles, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table audit_events, sessions, articles, administrators cascade");
    await pool.end();
  });
  await seedAdministrator(db, { username, password });
  const administrator = (await db.select({ id: administrators.id }).from(administrators).limit(1))[0]!;

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
  const firstPublishedAt = published.json().publishedAt as string;
  assert.match(firstPublishedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.notEqual(firstPublishedAt, explicitPublishedAt, "a draft's legacy authored timestamp is not first-public history");
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
  assert.equal(ordinaryEdit.json().publishedAt, firstPublishedAt);
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
  assert.equal(confirmedChange.json().publishedAt, firstPublishedAt);

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

  const audit = await pool.query<{ event: string; actor_administrator_id: string; target_id: string; metadata: Record<string, unknown> }>(
    "select event, actor_administrator_id, target_id, metadata from audit_events where target_type = 'article' order by occurred_at, id",
  );
  assert.deepEqual(Object.fromEntries(
    [...new Set(audit.rows.map((row) => row.event))].sort().map((event) => [event, audit.rows.filter((row) => row.event === event).length]),
  ), {
    "article.created": 2,
    "article.deleted": 2,
    "article.published": 2,
    "article.republished": 1,
    "article.unpublished": 1,
    "article.updated": 3,
  });
  const permittedMetadataKeys = new Set(["previousStatus", "status", "changedFields"]);
  const permittedChangedFields = new Set(["title", "summary", "coverUrl", "slug", "markdown", "publishedAt", "seoDescription", "categoryId", "tagIds", "coverMedia"]);
  for (const event of audit.rows) {
    assert.equal(event.actor_administrator_id, administrator.id);
    assert.match(event.target_id, /^[0-9a-f-]{36}$/);
    assert.equal(Object.keys(event.metadata).every((key) => permittedMetadataKeys.has(key)), true);
    if (Array.isArray(event.metadata.changedFields)) {
      assert.equal(event.metadata.changedFields.every((field) => typeof field === "string" && permittedChangedFields.has(field)), true);
    }
    const serializedMetadata = JSON.stringify(event.metadata);
    assert.doesNotMatch(serializedMetadata, /Lifecycle article|Lifecycle summary|Original source/);
    assert.doesNotMatch(serializedMetadata, new RegExp(slug));
  }
});
