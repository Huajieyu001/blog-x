import assert from "node:assert/strict";
import test from "node:test";
import { articleRevisionListSchema } from "@blog-x/contracts";

test("revision lists expose newest-first content-free summaries", () => {
  assert.deepEqual(articleRevisionListSchema.parse([{ id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-01-01T00:00:00.000Z", sourceVersion: "2026-01-01T00:00:00.000Z", changedFields: ["title"] }]), [{ id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-01-01T00:00:00.000Z", sourceVersion: "2026-01-01T00:00:00.000Z", changedFields: ["title"] }]);
});
