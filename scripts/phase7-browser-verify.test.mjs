import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PACKAGE_TEST_INVENTORY } from "./test-inventory.mjs";
import {
  createPhase7BrowserResult,
  phase7BrowserSelection,
  validatePhase7BrowserResult,
} from "./phase7-browser-verify.mjs";

const counts = { tests: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
const cleanup = { childrenAbsent: true, originsAbsent: true, webRootAbsent: true };

test("Phase 7 selection derives exactly its exclusive manifest path", () => {
  const selection = phase7BrowserSelection();
  assert.deepEqual(selection.inventory, ["apps/web/e2e/public-discovery.spec.ts"]);
  assert.equal(selection.manifestSha256, createHash("sha256").update(JSON.stringify(PACKAGE_TEST_INVENTORY)).digest("hex"));
});

test("Phase 7 result binds exact inventory actual counts cleanup and digest", () => {
  const record = createPhase7BrowserResult({ inventory: phase7BrowserSelection().inventory, counts, cleanup });
  assert.equal(record.format, "blog-x-phase7-browser-result");
  assert.equal(record.version, 2);
  assert.deepEqual(record.inventory, ["apps/web/e2e/public-discovery.spec.ts"]);
  assert.deepEqual(record.counts, counts);
  assert.deepEqual(record.cleanup, cleanup);
  assert.equal(record.releaseState, "BLOCKED");
  assert.match(record.manifestSha256, /^[a-f0-9]{64}$/);
  assert.match(record.resultSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(validatePhase7BrowserResult(record), record);
});

test("Phase 7 result rejects inventory count and cleanup drift", () => {
  const valid = { inventory: phase7BrowserSelection().inventory, counts, cleanup };
  for (const inventory of [[], [...valid.inventory, valid.inventory[0]], ["apps/web/e2e/public-errors.spec.ts"]]) {
    assert.throws(() => createPhase7BrowserResult({ ...valid, inventory }), /inventory|path|exact/i);
  }
  for (const invalidCounts of [
    { ...counts, tests: 0, passed: 0 },
    { ...counts, passed: 2, skipped: 1 },
    { ...counts, passed: 2, failed: 1 },
    { ...counts, passed: 2, cancelled: 1 },
    { ...counts, passed: 2, todo: 1 },
  ]) assert.throws(() => createPhase7BrowserResult({ ...valid, counts: invalidCounts }), /count|pass|zero/i);
  assert.throws(() => createPhase7BrowserResult({ ...valid, cleanup: { ...cleanup, originsAbsent: false } }), /cleanup/i);
  const record = createPhase7BrowserResult(valid);
  assert.throws(() => validatePhase7BrowserResult({ ...record, resultSha256: "0".repeat(64) }), /digest/i);
});
