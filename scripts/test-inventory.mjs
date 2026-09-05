import { readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryKeys = "fixtureOwner,kind,path,scope";

const entries = [
  { path: "packages/contracts/src/public-discovery.test.ts", kind: "contracts-unit", scope: "default", fixtureOwner: null },
  { path: "packages/contracts/src/tracer.test.ts", kind: "contracts-unit", scope: "default", fixtureOwner: null },
  { path: "apps/api/test/markdown-renderer.test.ts", kind: "api-unit", scope: "default", fixtureOwner: null },
  { path: "apps/api/test/security-hardening.test.ts", kind: "api-unit", scope: "default", fixtureOwner: null },
  { path: "apps/api/test/public-view-security.test.ts", kind: "api-unit", scope: "default", fixtureOwner: null },
  { path: "apps/web/app/admin/_components/article-actions-schedule.test.ts", kind: "web-unit", scope: "default", fixtureOwner: null },
  { path: "apps/web/app/admin/_components/article-editor-recovery.test.ts", kind: "web-unit", scope: "default", fixtureOwner: null },
  { path: "apps/web/app/lib/search-discovery.test.ts", kind: "web-unit", scope: "default", fixtureOwner: null },
  { path: "apps/web/app/lib/site-metadata.test.ts", kind: "web-unit", scope: "default", fixtureOwner: null },
  { path: "apps/web/lib/search-encoding.test.ts", kind: "web-unit", scope: "default", fixtureOwner: null },
  { path: "apps/web/server.test.mjs", kind: "web-unit", scope: "default", fixtureOwner: null },

  { path: "apps/api/test/article-draft-preview.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/article-lifecycle.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/auth-session.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/backup-restore.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "backup-restore" },
  { path: "apps/api/test/distribution-export.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/media.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "media" },
  { path: "apps/api/test/pages-archive.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/phase2-public-visibility.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/public-discovery.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/public-distribution.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/public-list.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/public-visibility.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },
  { path: "apps/api/test/taxonomy.test.ts", kind: "api-unit", scope: "integration", fixtureOwner: "database" },

  { path: "apps/web/e2e/about-archive.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/article-lifecycle.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/article-toc.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/auth-session.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/draft-preview.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/media.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/phase1-publishing.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/phase2-reading.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/phase3-distribution.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/phase4-restore.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "restore-browser" },
  { path: "apps/web/e2e/public-discovery.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "phase7-browser" },
  { path: "apps/web/e2e/public-errors.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "error-browser" },
  { path: "apps/web/e2e/public-list.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/public-reading.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/public-shell.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/taxonomy.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
  { path: "apps/web/e2e/walking-skeleton.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser" },
];

export const PACKAGE_TEST_INVENTORY = Object.freeze(entries.map((entry) => Object.freeze(entry)));
export const DEFAULT_TEST_FILES = Object.freeze(PACKAGE_TEST_INVENTORY.filter((entry) => entry.scope === "default").map((entry) => entry.path));
export const INTEGRATION_TEST_FILES = Object.freeze(PACKAGE_TEST_INVENTORY.filter((entry) => entry.scope === "integration").map((entry) => entry.path));

const canonicalByPath = new Map(PACKAGE_TEST_INVENTORY.map((entry) => [entry.path, entry]));

function entryDescription(entry) {
  return `${entry?.path ?? "<missing>"} (${entry?.kind ?? "<missing>"}, ${entry?.scope ?? "<missing>"}, ${entry?.fixtureOwner ?? "null"})`;
}

export function validatePackageTestInventory(manifest, onDiskPaths) {
  if (!Array.isArray(manifest) || !Array.isArray(onDiskPaths)) throw new Error("package test inventory validation requires arrays");
  const owned = new Map();
  for (const entry of manifest) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== entryKeys || typeof entry.path !== "string") {
      throw new Error(`package test inventory entry schema is invalid: ${entryDescription(entry)}`);
    }
    if (owned.has(entry.path)) throw new Error(`package test inventory has duplicate ownership: ${entry.path}`);
    owned.set(entry.path, entry);
    const canonical = canonicalByPath.get(entry.path);
    if (!canonical || canonical.kind !== entry.kind || canonical.scope !== entry.scope || canonical.fixtureOwner !== entry.fixtureOwner) {
      throw new Error(`package test inventory ownership is invalid: ${entryDescription(entry)}`);
    }
  }

  const actual = [...onDiskPaths].sort();
  if (actual.some((path, index) => path === actual[index - 1])) {
    throw new Error(`package test filesystem scan returned a duplicate path: ${actual.find((path, index) => path === actual[index - 1])}`);
  }
  for (const path of [...owned.keys()].sort()) {
    if (!actual.includes(path)) throw new Error(`package test inventory is missing on-disk path: ${path}`);
  }
  for (const path of actual) {
    if (!owned.has(path)) throw new Error(`package test inventory has unowned on-disk path: ${path}`);
  }
  if (owned.size !== canonicalByPath.size) {
    const missing = [...canonicalByPath.keys()].find((path) => !owned.has(path));
    throw new Error(`package test inventory omitted canonical ownership: ${missing}`);
  }

  return {
    total: manifest.length,
    default: manifest.filter((entry) => entry.scope === "default").length,
    integration: manifest.filter((entry) => entry.scope === "integration").length,
  };
}

async function scanTree(directory, predicate) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...await scanTree(path, predicate));
    else if (entry.isFile() && predicate(entry.name)) found.push(relative(root, path).split(sep).join("/"));
  }
  return found;
}

async function scanPackageTests() {
  const groups = await Promise.all([
    scanTree(resolve(root, "packages/contracts/src"), (name) => name.endsWith(".test.ts")),
    scanTree(resolve(root, "apps/api/test"), (name) => name.endsWith(".test.ts")),
    scanTree(resolve(root, "apps/web/app"), (name) => name.endsWith(".test.ts")),
    scanTree(resolve(root, "apps/web/lib"), (name) => name.endsWith(".test.ts")),
    scanTree(resolve(root, "apps/web"), (name) => name.endsWith(".test.mjs")),
    scanTree(resolve(root, "apps/web/e2e"), (name) => name.endsWith(".spec.ts")),
  ]);
  return groups.flat().sort();
}

export async function assertCompleteTestInventory() {
  if (arguments.length !== 0) throw new Error("package test inventory accepts no caller-selected paths");
  return validatePackageTestInventory(PACKAGE_TEST_INVENTORY, await scanPackageTests());
}
