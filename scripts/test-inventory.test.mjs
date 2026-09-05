import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TEST_FILES,
  INTEGRATION_TEST_FILES,
  PACKAGE_TEST_INVENTORY,
  assertCompleteTestInventory,
  validatePackageTestInventory,
} from "./test-inventory.mjs";

const manifestPaths = () => PACKAGE_TEST_INVENTORY.map((entry) => entry.path);
const cloneManifest = () => PACKAGE_TEST_INVENTORY.map((entry) => ({ ...entry }));

test("package test inventory is frozen, exact, complete and disjoint", async () => {
  assert.equal(Object.isFrozen(PACKAGE_TEST_INVENTORY), true);
  assert.equal(PACKAGE_TEST_INVENTORY.every(Object.isFrozen), true);
  assert.equal(PACKAGE_TEST_INVENTORY.length, 41);
  assert.equal(DEFAULT_TEST_FILES.length, 11);
  assert.equal(INTEGRATION_TEST_FILES.length, 30);
  assert.equal(new Set([...DEFAULT_TEST_FILES, ...INTEGRATION_TEST_FILES]).size, 41);
  assert.deepEqual(DEFAULT_TEST_FILES, [
    "packages/contracts/src/public-discovery.test.ts",
    "packages/contracts/src/tracer.test.ts",
    "apps/api/test/markdown-renderer.test.ts",
    "apps/api/test/security-hardening.test.ts",
    "apps/api/test/public-view-security.test.ts",
    "apps/web/app/admin/_components/article-actions-schedule.test.ts",
    "apps/web/app/admin/_components/article-editor-recovery.test.ts",
    "apps/web/app/lib/search-discovery.test.ts",
    "apps/web/app/lib/site-metadata.test.ts",
    "apps/web/lib/search-encoding.test.ts",
    "apps/web/server.test.mjs",
  ]);

  const result = await assertCompleteTestInventory();
  assert.deepEqual(result, { total: 41, default: 11, integration: 30 });
});

test("integration inventory has exact runner-owner counts", () => {
  const counts = Object.fromEntries([
    "database",
    "backup-restore",
    "media",
    "main-browser",
    "error-browser",
    "restore-browser",
    "phase7-browser",
  ].map((owner) => [owner, PACKAGE_TEST_INVENTORY.filter((entry) => entry.fixtureOwner === owner).length]));

  assert.deepEqual(counts, {
    database: 11,
    "backup-restore": 1,
    media: 1,
    "main-browser": 14,
    "error-browser": 1,
    "restore-browser": 1,
    "phase7-browser": 1,
  });
  assert.deepEqual(
    PACKAGE_TEST_INVENTORY.find((entry) => entry.path === "apps/web/e2e/public-discovery.spec.ts"),
    { path: "apps/web/e2e/public-discovery.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "phase7-browser" },
  );
});

test("synthetic missing path fails with the exact omitted path", () => {
  const missing = "apps/api/test/public-list.test.ts";
  assert.throws(
    () => validatePackageTestInventory(cloneManifest(), manifestPaths().filter((path) => path !== missing)),
    new RegExp(`package test inventory is missing on-disk path: ${missing.replaceAll(".", "\\.")}`),
  );
});

test("synthetic added path fails with the exact unowned path", () => {
  const added = "apps/api/test/unowned.test.ts";
  assert.throws(
    () => validatePackageTestInventory(cloneManifest(), [...manifestPaths(), added]),
    new RegExp(`package test inventory has unowned on-disk path: ${added.replaceAll(".", "\\.")}`),
  );
});

test("synthetic duplicate ownership fails with the exact duplicate path", () => {
  const duplicate = "apps/web/lib/search-encoding.test.ts";
  const manifest = cloneManifest();
  manifest.push({ ...manifest.find((entry) => entry.path === duplicate) });
  assert.throws(
    () => validatePackageTestInventory(manifest, manifestPaths()),
    new RegExp(`package test inventory has duplicate ownership: ${duplicate.replaceAll(".", "\\.")}`),
  );
});

test("synthetic invalid owner fails with the exact path and owner", () => {
  const path = "apps/web/e2e/public-discovery.spec.ts";
  const manifest = cloneManifest().map((entry) => entry.path === path ? { ...entry, fixtureOwner: "main-browser" } : entry);
  assert.throws(
    () => validatePackageTestInventory(manifest, manifestPaths()),
    /apps\/web\/e2e\/public-discovery\.spec\.ts.*main-browser/,
  );
});

test("default and integration ownership cannot be swapped", () => {
  const path = "apps/api/test/markdown-renderer.test.ts";
  const manifest = cloneManifest().map((entry) => entry.path === path
    ? { ...entry, scope: "integration", fixtureOwner: "database" }
    : entry);
  assert.throws(
    () => validatePackageTestInventory(manifest, manifestPaths()),
    /apps\/api\/test\/markdown-renderer\.test\.ts.*integration.*database/,
  );
});

test("anonymous view security coverage fails closed on omission, duplication, or owner drift", () => {
  const path = "apps/api/test/public-view-security.test.ts";
  assert.throws(
    () => validatePackageTestInventory(cloneManifest(), manifestPaths().filter((entry) => entry !== path)),
    /package test inventory is missing on-disk path: apps\/api\/test\/public-view-security\.test\.ts/,
  );
  const duplicate = cloneManifest();
  duplicate.push({ ...duplicate.find((entry) => entry.path === path) });
  assert.throws(
    () => validatePackageTestInventory(duplicate, manifestPaths()),
    /package test inventory has duplicate ownership: apps\/api\/test\/public-view-security\.test\.ts/,
  );
  const ownerDrift = cloneManifest().map((entry) => entry.path === path ? { ...entry, scope: "integration", fixtureOwner: "database" } : entry);
  assert.throws(
    () => validatePackageTestInventory(ownerDrift, manifestPaths()),
    /apps\/api\/test\/public-view-security\.test\.ts.*integration.*database/,
  );
});
