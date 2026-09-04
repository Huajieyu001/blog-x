import assert from "node:assert/strict";
import test from "node:test";
import {
  adminPostSchema,
  scheduleArticleInputSchema,
} from "./admin-posts.js";
import { auditEventInputSchema } from "./audit.js";
import { portableExportManifestSchema } from "./distribution.js";
import { loginInputSchema } from "./auth.js";
import { mediaUsageReferenceSchema } from "./media.js";
import { publishInputSchema, publicArticleDetailSchema, publicArticleListSchema } from "./tracer.js";

test("login input requires bounded username and password fields", () => {
  assert.equal(loginInputSchema.safeParse({ username: "admin", password: "secret" }).success, true);
  const invalid = loginInputSchema.safeParse({ username: "", password: "" });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.deepEqual(invalid.error.issues.map((issue) => issue.path.join(".")), ["username", "password"]);
});

test("publish input rejects malformed wire fields", () => {
  assert.equal(publishInputSchema.safeParse({ title: "Post", slug: "post", markdown: "# Post" }).success, true);
  const invalid = publishInputSchema.safeParse({ title: "", slug: "Not a slug", markdown: "" });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.deepEqual(invalid.error.issues.map((issue) => issue.path.join(".")), ["title", "slug", "markdown"]);
});

test("public response schemas allowlist only public wire fields", () => {
  assert.equal(publicArticleListSchema.safeParse([{ title: "Post", slug: "post", publishedAt: "2026-08-06T00:00:00.000Z" }]).success, true);
  assert.equal(publicArticleDetailSchema.safeParse({ title: "Post", slug: "post", publishedAt: "2026-08-06T00:00:00.000Z", html: "<h1>Post</h1>" }).success, true);
  assert.equal(publicArticleDetailSchema.safeParse({ title: "Post", slug: "post", publishedAt: "2026-08-06T00:00:00.000Z", html: "<h1>Post</h1>", passwordHash: "never" }).success, false);
});

test("purposeful media usage requires alt text while decorative media clears that requirement", () => {
  const reference = {
    id: "00000000-0000-4000-8000-000000000001",
    url: "/media/00000000-0000-4000-8000-000000000001",
    width: 120,
    height: 40,
    mimeType: "image/png",
    alt: "",
    decorative: false,
  };
  assert.equal(mediaUsageReferenceSchema.safeParse(reference).success, false);
  assert.equal(mediaUsageReferenceSchema.safeParse({ ...reference, alt: "架构图" }).success, true);
  assert.equal(mediaUsageReferenceSchema.safeParse({ ...reference, decorative: true }).success, true);
});

test("schedule contracts require an offset-bearing instant and never expose the scheduling actor", () => {
  const scheduledAt = "2026-12-01T10:15:30.000+08:00";
  assert.equal(scheduleArticleInputSchema.safeParse({ scheduledAt }).success, true);
  for (const input of [
    {},
    { scheduledAt: null },
    { scheduledAt: "2026-12-01T10:15:30" },
    { scheduledAt: "not-a-date" },
    { scheduledAt, scheduledByAdministratorId: "00000000-0000-4000-8000-000000000001" },
  ]) assert.equal(scheduleArticleInputSchema.safeParse(input).success, false);

  const admin = {
    id: "00000000-0000-4000-8000-000000000010",
    title: "Scheduled draft",
    summary: "",
    coverUrl: "",
    slug: "scheduled-draft",
    markdown: "# Scheduled",
    publishedAt: null,
    seoDescription: "",
    categoryId: null,
    tagIds: [],
    status: "draft",
    legacyMediaReview: "clear",
    version: "2026-12-01T02:15:30.000Z",
    scheduledAt: "2026-12-01T02:15:30.000Z",
  };
  assert.equal(adminPostSchema.safeParse(admin).success, true);
  assert.equal(adminPostSchema.safeParse({ ...admin, scheduledByAdministratorId: "00000000-0000-4000-8000-000000000001" }).success, false);
});

test("schedule audit and portable contracts preserve only complete paired authority", () => {
  const administratorId = "00000000-0000-4000-8000-000000000001";
  const scheduledAt = "2026-12-01T02:15:30.000Z";
  assert.equal(auditEventInputSchema.safeParse({
    actorAdministratorId: administratorId,
    event: "article.scheduled_published",
    targetType: "article",
    targetId: "00000000-0000-4000-8000-000000000002",
    metadata: { scheduledAt, previousScheduledAt: "2026-11-30T02:15:30.000Z", status: "published" },
  }).success, true);
  assert.equal(auditEventInputSchema.safeParse({
    actorAdministratorId: administratorId,
    event: "article.scheduled",
    targetType: "article",
    targetId: "00000000-0000-4000-8000-000000000002",
    metadata: { title: "private content" },
  }).success, false);

  const manifest = {
    format: "blog-x-portable-export",
    version: 1,
    exportedAt: scheduledAt,
    articles: [{
      id: "00000000-0000-4000-8000-000000000010",
      title: "Scheduled draft",
      summary: "",
      coverUrl: "",
      slug: "scheduled-draft",
      markdown: "# Scheduled",
      seoDescription: "",
      status: "draft",
      publishedAt: null,
      deletedAt: null,
      createdAt: "2026-11-01T02:15:30.000Z",
      updatedAt: "2026-11-01T02:15:30.000Z",
      categoryId: null,
      tagIds: [],
      coverMediaId: null,
      coverAlt: "",
      coverDecorative: false,
    }],
    categories: [],
    tags: [],
    media: [],
    about: null,
  };
  assert.equal(portableExportManifestSchema.safeParse(manifest).success, true, "legacy v1 authority remains readable");
  assert.equal(portableExportManifestSchema.safeParse({
    ...manifest,
    articles: [{ ...manifest.articles[0], scheduledAt, scheduledByAdministratorId: administratorId }],
  }).success, true);
  for (const article of [
    { ...manifest.articles[0], scheduledAt },
    { ...manifest.articles[0], scheduledByAdministratorId: administratorId },
    { ...manifest.articles[0], scheduledAt, scheduledByAdministratorId: null },
    { ...manifest.articles[0], scheduledAt: null, scheduledByAdministratorId: administratorId },
  ]) assert.equal(portableExportManifestSchema.safeParse({ ...manifest, articles: [article] }).success, false);
});
