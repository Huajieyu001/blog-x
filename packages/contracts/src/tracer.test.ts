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
import * as contracts from "./index.js";

type PendingAnalyticsContracts = typeof contracts & {
  anonymousViewSourceValues?: readonly string[];
  anonymousViewSourceSchema?: { safeParse(value: unknown): { success: boolean } };
  anonymousViewSlugParamsSchema?: { safeParse(value: unknown): { success: boolean } };
  anonymousViewBodySchema?: { safeParse(value: unknown): { success: boolean } };
  viewRetentionResultSchema?: { safeParse(value: unknown): { success: boolean } };
};

test("login input requires bounded username and password fields", () => {
  assert.equal(loginInputSchema.safeParse({ username: "admin", password: "secret" }).success, true);
  const invalid = loginInputSchema.safeParse({ username: "", password: "" });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.deepEqual(invalid.error.issues.map((issue) => issue.path.join(".")), ["username", "password"]);
});

test("anonymous view contracts accept only fixed sources, strict empty bodies, and public slug grammar", () => {
  const analytics = contracts as PendingAnalyticsContracts;
  assert.deepEqual(analytics.anonymousViewSourceValues, ["direct", "internal", "search", "social", "external"]);
  assert.equal(analytics.anonymousViewSourceSchema?.safeParse("direct").success, true);
  assert.equal(analytics.anonymousViewSourceSchema?.safeParse("unknown").success, false);
  assert.equal(analytics.anonymousViewSlugParamsSchema?.safeParse({ slug: "private-insights-2026" }).success, true);
  assert.equal(analytics.anonymousViewSlugParamsSchema?.safeParse({ slug: "Not A Slug" }).success, false);
  assert.equal(analytics.anonymousViewSlugParamsSchema?.safeParse({ slug: "x".repeat(181) }).success, false);
  assert.equal(analytics.anonymousViewBodySchema?.safeParse({}).success, true);
  assert.equal(analytics.anonymousViewBodySchema?.safeParse({ source: "direct" }).success, false);
});

test("view retention output has a strict aggregate-only command contract", () => {
  const analytics = contracts as PendingAnalyticsContracts;
  const result = {
    format: "blog-x-view-retention",
    version: 1,
    command: "cleanup-views",
    retainedFromDay: "2025-08-31",
    limit: 100,
    deleted: 3,
  };
  assert.equal(analytics.viewRetentionResultSchema?.safeParse(result).success, true);
  for (const invalid of [
    { ...result, retainedFromDay: "2025-8-31" },
    { ...result, limit: 0 },
    { ...result, limit: 10_001 },
    { ...result, deleted: -1 },
    { ...result, articleId: "00000000-0000-4000-8000-000000000001" },
    { ...result, slug: "private-post" },
    { ...result, origin: "https://example.invalid" },
  ]) assert.equal(analytics.viewRetentionResultSchema?.safeParse(invalid).success, false);
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
  for (const [label, article] of [
    ["explicit null schedule authority remains readable", { ...manifest.articles[0], scheduledAt: null, scheduledByAdministratorId: null }],
    ["retained draft may carry a complete schedule authority", { ...manifest.articles[0], scheduledAt, scheduledByAdministratorId: administratorId }],
  ] as const) {
    assert.equal(portableExportManifestSchema.safeParse({ ...manifest, articles: [article] }).success, true, label);
  }
  for (const article of [
    { ...manifest.articles[0], scheduledAt },
    { ...manifest.articles[0], scheduledByAdministratorId: administratorId },
    { ...manifest.articles[0], scheduledAt, scheduledByAdministratorId: null },
    { ...manifest.articles[0], scheduledAt: null, scheduledByAdministratorId: administratorId },
    { ...manifest.articles[0], scheduledAt, scheduledByAdministratorId: undefined },
  ]) assert.equal(portableExportManifestSchema.safeParse({ ...manifest, articles: [article] }).success, false);

  for (const [label, article] of [
    ["published article cannot retain schedule authority", { ...manifest.articles[0], status: "published", publishedAt: scheduledAt, scheduledAt, scheduledByAdministratorId: administratorId }],
    ["unpublished article cannot retain schedule authority", { ...manifest.articles[0], status: "unpublished", publishedAt: scheduledAt, scheduledAt, scheduledByAdministratorId: administratorId }],
    ["soft-deleted draft cannot retain schedule authority", { ...manifest.articles[0], deletedAt: scheduledAt, scheduledAt, scheduledByAdministratorId: administratorId }],
  ] as const) {
    assert.equal(portableExportManifestSchema.safeParse({ ...manifest, articles: [article] }).success, false, label);
  }
});
