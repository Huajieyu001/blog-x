import assert from "node:assert/strict";
import test from "node:test";
import { articleRevisionDetailSchema, articleRevisionListSchema } from "@blog-x/contracts";

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
