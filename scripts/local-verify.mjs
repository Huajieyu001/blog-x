import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { auditRepository, evaluateRepositoryBoundaries } from "./check-boundaries.mjs";
import { createBackupSet } from "./backup/create.mjs";
import { verifyBackupSet } from "./backup/manifest.mjs";
import { cleanupGeneratedBackupRoot } from "./backup/paths.mjs";
import {
  cleanupGeneratedRestoreRoot,
  restoreBackupSet,
  validateRestoreDatabase,
  validateRestoreMediaVolume,
  validateRestoreNamespace,
} from "./backup/restore.mjs";
import { runProductionPipeline } from "./backup/production-pipeline.mjs";
import {
  acquirePhase5ReceiptWriterLock,
  canonicalPhase5ResultBytes,
  hashPhase5ResultRecord,
  releasePhase5ReceiptWriterLock,
  writePhase5ReceiptAtomic,
} from "./phase5-receipt.mjs";
import { productionBackupResultSchema } from "./backup/production/results.mjs";
import { installCooperativeShutdown } from "./local-delivery-child-tree.mjs";
import { PACKAGE_TEST_INVENTORY } from "./test-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);
const composeFile = resolve(root, "compose.yaml");
const apiImage = "blog-x-api-verify:phase2";
const webImage = "blog-x-web-verify:phase2";
let shutdownSignal;
const allocatedGeneratedNamespaces = new Set();
const confirmedGeneratedNamespaces = new Set();
const allocatedGeneratedAuthorities = new Map();
const migratedMainBrowserSpecs = Object.freeze([
  "apps/web/e2e/article-lifecycle.spec.ts",
  "apps/web/e2e/auth-session.spec.ts",
  "apps/web/e2e/draft-preview.spec.ts",
  "apps/web/e2e/public-list.spec.ts",
  "apps/web/e2e/public-reading.spec.ts",
  "apps/web/e2e/walking-skeleton.spec.ts",
]);

export const PHASE6_DATA_RESULT_FORMAT = "blog-x-phase6-data-result";
const PHASE6_DATA_RESULT_PREFIX = "BLOG X PHASE6 DATA RESULT ";
export const PHASE11_DATA_RESULT_FORMAT = "blog-x-phase11-data-result";
const PHASE11_DATA_RESULT_PREFIX = "BLOG X PHASE11 DATA RESULT ";
export const GENERATED_INTEGRATION_RESULT_FORMAT = "blog-x-generated-integration-result";
const GENERATED_INTEGRATION_RESULT_PREFIX = "BLOG X GENERATED INTEGRATION RESULT ";
const GENERATED_INTEGRATION_CLEANUP_PREFIX = "BLOG X GENERATED INTEGRATION CLEANUP ACK ";
const LIFECYCLE_CLEANUP_PREFIX = "BLOG X LIFECYCLE CLEANUP ACK ";

function frozenGroups(entries) {
  const groups = {};
  for (const entry of entries) (groups[entry.fixtureOwner] ??= []).push(entry.path);
  return Object.freeze(Object.fromEntries(Object.entries(groups).map(([owner, paths]) => [owner, Object.freeze(paths.sort())])));
}

export function canonicalIntegrationSelection() {
  const entries = PACKAGE_TEST_INVENTORY
    .filter((entry) => entry.scope === "integration" && entry.fixtureOwner !== "phase7-browser")
    .map((entry) => ({ path: entry.path, kind: entry.kind, fixtureOwner: entry.fixtureOwner }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const paths = entries.map((entry) => entry.path);
  const groups = frozenGroups(entries);
  const expectedOwners = { database: 11, "backup-restore": 1, media: 1, "main-browser": 14, "error-browser": 1, "restore-browser": 1 };
  if (entries.length !== 29 || new Set(paths).size !== entries.length
    || paths.filter((path) => path.startsWith("apps/api/")).length !== 13
    || paths.filter((path) => path.startsWith("apps/web/e2e/")).length !== 16
    || Object.entries(expectedOwners).some(([owner, count]) => groups[owner]?.length !== count)
    || Object.keys(groups).some((owner) => !Object.hasOwn(expectedOwners, owner))) {
    throw new Error("canonical integration inventory ownership is incomplete or duplicated");
  }
  return Object.freeze({
    paths: Object.freeze(paths),
    groups,
    manifestSha256: hashText(JSON.stringify(PACKAGE_TEST_INVENTORY)),
  });
}

function exactCleanup(cleanup) {
  if (!cleanup || typeof cleanup !== "object" || Array.isArray(cleanup)
    || Object.keys(cleanup).sort().join(",") !== "containersAbsent,namespace,pathsAbsent,volumesAbsent"
    || validateNamespace(cleanup.namespace) !== cleanup.namespace
    || cleanup.containersAbsent !== true || cleanup.volumesAbsent !== true || cleanup.pathsAbsent !== true) {
    throw new Error("generated integration cleanup acknowledgement is incomplete");
  }
  return { ...cleanup };
}

export function createLifecycleProbeResult({ kind, namespaces, interrupted }) {
  if (!Array.isArray(namespaces)) throw new Error("lifecycle probe namespaces are invalid");
  for (const namespace of namespaces) validateNamespace(namespace);
  if (!["interruption", "parallel"].includes(kind)
    || namespaces.length !== (kind === "parallel" ? 2 : 1)
    || new Set(namespaces).size !== namespaces.length
    || interrupted !== (kind === "interruption")) throw new Error("lifecycle probe authority is invalid");
  return Object.freeze({
    format: "blog-x-generated-lifecycle-probe",
    version: 1,
    kind,
    namespaces: Object.freeze([...namespaces]),
    interrupted,
    inventory: Object.freeze([]),
    counts: Object.freeze({ tests: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0 }),
    cleanupAcknowledged: true,
    releaseState: "BLOCKED",
  });
}

export function createGeneratedIntegrationResult({ suites, cleanup, probes = [] }) {
  const selection = canonicalIntegrationSelection();
  if (!Array.isArray(suites) || suites.length !== selection.paths.length) throw new Error("generated integration inventory is missing or contains extras");
  const normalized = suites.map((suite, index) => {
    const expectedPath = selection.paths[index];
    const expectedOwner = PACKAGE_TEST_INVENTORY.find((entry) => entry.path === expectedPath)?.fixtureOwner;
    if (!suite || typeof suite !== "object" || Array.isArray(suite)
      || Object.keys(suite).sort().join(",") !== "counts,fixtureOwner,path"
      || suite.path !== expectedPath || suite.fixtureOwner !== expectedOwner) {
      throw new Error("generated integration inventory is not exact or contains a duplicate path");
    }
    return { path: suite.path, fixtureOwner: suite.fixtureOwner, counts: { ...assertPassOnlyCounts(suite.counts, `generated integration suite ${suite.path}`) } };
  });
  if (!Array.isArray(probes)) throw new Error("generated integration lifecycle probes are invalid or coverage-bearing");
  const canonicalProbes = probes.map((probe) => {
    if (!probe || typeof probe !== "object" || Array.isArray(probe)) throw new Error("generated integration lifecycle probes are invalid or coverage-bearing");
    const canonical = createLifecycleProbeResult({ kind: probe.kind, namespaces: probe.namespaces, interrupted: probe.interrupted });
    if (JSON.stringify(probe) !== JSON.stringify(canonical)) throw new Error("generated integration lifecycle probes are invalid or coverage-bearing");
    return canonical;
  });
  if (canonicalProbes.length !== 2 || canonicalProbes[0].kind !== "interruption" || canonicalProbes[1].kind !== "parallel") {
    throw new Error("generated integration requires the exact ordered lifecycle probe pair");
  }
  const body = {
    format: GENERATED_INTEGRATION_RESULT_FORMAT,
    version: 1,
    manifestSha256: selection.manifestSha256,
    inventory: [...selection.paths],
    suites: normalized,
    probes: canonicalProbes.map((probe) => structuredClone(probe)),
    counts: assertPassOnlyCounts(sumCounts(normalized.map((suite) => suite.counts)), "generated integration result"),
    cleanup: exactCleanup(cleanup),
    releaseState: "BLOCKED",
  };
  return { ...body, resultSha256: hashText(JSON.stringify(body)) };
}

export function validateNamespace(value) {
  if (!/^blogxverify_[a-z0-9]{8,32}$/.test(value ?? "")) {
    throw new Error("verification namespace must match blogxverify_[a-z0-9]{8,32}");
  }
  return value;
}

export function validateMediaVolume(value, namespace) {
  validateNamespace(namespace);
  if (value !== `${namespace}_media-data`) throw new Error("verification media volume must exactly match its generated namespace");
  return value;
}

export function validateDatabaseName(value, namespace) {
  validateNamespace(namespace);
  if (value !== `blog_x_${namespace.slice("blogxverify_".length)}`) {
    throw new Error("verification database must exactly match its generated namespace");
  }
  return value;
}

export function validateLoopbackHttpOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("verification public origin must be an absolute loopback HTTP origin"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("verification public origin must be an absolute loopback HTTP origin");
  }
  return url.origin;
}

export function migratedMainBrowserSelection() {
  const inventoryByPath = new Map(PACKAGE_TEST_INVENTORY.map((entry) => [entry.path, entry]));
  for (const path of migratedMainBrowserSpecs) {
    const entry = inventoryByPath.get(path);
    if (!entry || entry.kind !== "web-e2e" || entry.scope !== "integration" || entry.fixtureOwner !== "main-browser") {
      throw new Error(`migrated main-browser ownership is invalid: ${path}`);
    }
  }
  if (new Set(migratedMainBrowserSpecs).size !== migratedMainBrowserSpecs.length) {
    throw new Error("migrated main-browser selection contains duplicate paths");
  }
  return [...migratedMainBrowserSpecs];
}

function canonicalMainBrowserSelection() {
  const paths = canonicalIntegrationSelection().groups["main-browser"];
  if (!paths || paths.length !== 14 || new Set(paths).size !== paths.length) throw new Error("canonical main-browser ownership is invalid");
  return [...paths];
}

function validateMainBrowserContext(context) {
  validateNamespace(context?.namespace);
  validateDatabaseName(context?.database, context.namespace);
  validateMediaVolume(context?.mediaVolume, context.namespace);
  const webOrigin = validateLoopbackHttpOrigin(context?.webOrigin);
  if (new URL(webOrigin).port === "3100") throw new Error("generated main-browser fixture cannot claim canonical port 3100");
  if (!/^[a-z0-9][a-z0-9_-]{7,64}$/.test(context?.runId ?? "")) throw new Error("generated main-browser run ID is invalid");
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(context?.username ?? "") || typeof context?.password !== "string" || context.password.length < 8) {
    throw new Error("generated main-browser administrator identity is invalid");
  }
  return context;
}

const mainBrowserOptionalFactNames = new Set(["E2E_EXPIRED_SESSION_TOKEN", "E2E_REVOKED_SESSION_TOKEN"]);

export function createMainBrowserEnvironment(context, scenarioFacts = {}, inheritedEnvironment = process.env) {
  validateMainBrowserContext(context);
  if (!scenarioFacts || typeof scenarioFacts !== "object" || Array.isArray(scenarioFacts)) throw new Error("main-browser scenario facts must be an object");
  for (const [name, value] of Object.entries(scenarioFacts)) {
    if (!mainBrowserOptionalFactNames.has(name) || typeof value !== "string" || !value) {
      throw new Error(`main-browser scenario fact is invalid: ${name}`);
    }
  }
  const environment = Object.fromEntries(Object.entries(inheritedEnvironment ?? {}).filter(([name, value]) =>
    typeof value === "string"
    && !/^E2E_/.test(name)
    && !/(?:^|_)DATABASE_URL$/.test(name)
    && !/^BLOG_X_/.test(name)
    && !/^ADMIN_/.test(name)));
  return Object.freeze({
    ...environment,
    E2E_WEB_ORIGIN: context.webOrigin,
    E2E_RUN_ID: context.runId,
    E2E_ADMIN_USERNAME: context.username,
    E2E_ADMIN_PASSWORD: context.password,
    ...scenarioFacts,
  });
}

export function phase3Selection(mode) {
  const api = ["PHASE3_TEST_DATABASE_URL", "apps/api/test/public-distribution.test.ts"];
  const exportApi = ["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"];
  const metadata = "apps/web/app/lib/site-metadata.test.ts";
  const browser = "apps/web/e2e/phase3-distribution.spec.ts";
  const selections = {
    api: { databaseSuites: [api], webSuites: [] },
    metadata: { databaseSuites: [], webSuites: [metadata, browser] },
    full: { databaseSuites: [api, exportApi], webSuites: [metadata, browser] },
    "export-api": { databaseSuites: [exportApi], webSuites: [] },
    "export-browser": { databaseSuites: [], webSuites: [browser] },
  };
  const selection = selections[mode];
  if (!selection) throw new Error(`Phase 3 selection is not recognized: ${mode}`);
  return selection;
}

export function phase4Selection(mode) {
  const security = {
    databaseSuites: [
        ["AUTH_TEST_DATABASE_URL", "apps/api/test/auth-session.test.ts"],
        ["ARTICLE_TEST_DATABASE_URL", "apps/api/test/article-draft-preview.test.ts"],
        ["LIFECYCLE_TEST_DATABASE_URL", "apps/api/test/article-lifecycle.test.ts"],
        ["PUBLIC_LIST_TEST_DATABASE_URL", "apps/api/test/public-list.test.ts"],
        ["PUBLIC_VISIBILITY_TEST_DATABASE_URL", "apps/api/test/public-visibility.test.ts"],
        ["AUTH_TEST_DATABASE_URL", "apps/api/test/taxonomy.test.ts"],
        ["AUTH_TEST_DATABASE_URL", "apps/api/test/pages-archive.test.ts"],
        ["AUTH_TEST_DATABASE_URL", "apps/api/test/media.test.ts"],
        ["PHASE2_TEST_DATABASE_URL", "apps/api/test/phase2-public-visibility.test.ts"],
        ["PHASE3_TEST_DATABASE_URL", "apps/api/test/public-distribution.test.ts"],
        ["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"],
    ],
    apiSuites: [
        "apps/api/test/security-hardening.test.ts",
        "apps/api/test/markdown-renderer.test.ts",
    ],
  };
  const operations = { nodeSuites: ["scripts/ops-status.test.mjs", "scripts/backup/backup.test.mjs", "scripts/local-verify.test.mjs"] };
  const restore = {
    nodeSuites: ["scripts/backup/restore.test.mjs", "scripts/local-verify.test.mjs"],
    databaseSuite: "apps/api/test/backup-restore.test.ts",
    browserSuite: "apps/web/e2e/phase4-restore.spec.ts",
  };
  const selection = {
    security,
    operations,
    restore,
    full: {
      databaseSuites: security.databaseSuites,
      apiSuites: security.apiSuites,
      nodeSuites: [...new Set([...operations.nodeSuites, ...restore.nodeSuites, "scripts/release-gate.test.mjs"])],
      browserSuites: ["apps/web/e2e/phase2-reading.spec.ts", "apps/web/e2e/phase3-distribution.spec.ts", restore.browserSuite],
    },
  }[mode];
  if (!selection) throw new Error(`Phase 4 selection is not recognized: ${mode}`);
  return selection;
}

export function phase5MediaSelection() {
  return {
    databaseSuites: [
      ["ARTICLE_TEST_DATABASE_URL", "apps/api/test/article-draft-preview.test.ts"],
      ["LIFECYCLE_TEST_DATABASE_URL", "apps/api/test/article-lifecycle.test.ts"],
      ["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"],
    ],
    apiSuites: ["apps/api/test/markdown-renderer.test.ts"],
    nodeSuites: ["scripts/prohibitions/media-policy.test.mjs", "scripts/local-verify.test.mjs"],
    databaseSuite: "apps/api/test/backup-restore.test.ts",
    browserSuites: ["apps/web/e2e/phase1-publishing.spec.ts", "apps/web/e2e/phase4-restore.spec.ts"],
  };
}

function uniqueSuites(suites) {
  return [...new Map(suites.map((suite) => [Array.isArray(suite) ? suite[1] : suite, suite])).values()];
}

export function phase5Selection(mode) {
  if (mode !== "full") throw new Error(`Phase 5 selection is not recognized: ${mode}`);
  const phase4 = phase4Selection("full");
  const media = phase5MediaSelection();
  return {
    databaseSuites: uniqueSuites([...phase4.databaseSuites, ...media.databaseSuites]),
    apiSuites: uniqueSuites([...phase4.apiSuites, ...media.apiSuites]),
    nodeSuites: uniqueSuites([
      ...phase4.nodeSuites,
      ...media.nodeSuites,
      "scripts/backup/production.test.mjs",
      "scripts/phase5-receipt.test.mjs",
      "scripts/phase5-receipt-prohibitions.test.mjs",
      "scripts/phase5-receipt-concurrency.test.mjs",
    ]),
    databaseSuite: media.databaseSuite,
    browserSuites: uniqueSuites([...phase4.browserSuites, ...media.browserSuites]),
  };
}

export function phase6Selection(mode) {
  if (mode !== "data") throw new Error(`Phase 6 selection is not recognized: ${mode}`);
  return {
    databaseSuites: [
      ["PUBLIC_DISCOVERY_TEST_DATABASE_URL", "apps/api/test/public-discovery.test.ts"],
      ["PUBLIC_LIST_TEST_DATABASE_URL", "apps/api/test/public-list.test.ts"],
      ["PUBLIC_VISIBILITY_TEST_DATABASE_URL", "apps/api/test/public-visibility.test.ts"],
      ["AUTH_TEST_DATABASE_URL", "apps/api/test/taxonomy.test.ts"],
      ["PHASE2_TEST_DATABASE_URL", "apps/api/test/phase2-public-visibility.test.ts"],
    ],
    nodeSuites: ["scripts/local-verify.test.mjs"],
    boundarySuite: "scripts/check-boundaries.mjs",
  };
}

export function phase11Selection(mode) {
  if (mode !== "data") throw new Error(`Phase 11 selection is not recognized: ${mode}`);
  return {
    databaseSuites: [
      ["PUBLIC_VISIBILITY_TEST_DATABASE_URL", "apps/api/test/public-visibility.test.ts"],
      ["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"],
    ],
    restoreSuite: "apps/api/test/backup-restore.test.ts",
    nodeSuites: ["scripts/local-verify.test.mjs"],
  };
}

export function validateTopologyPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("topology policy must be an object");
  const policy = value;
  if (Object.keys(policy).sort().join(",") !== "browser,format,futurePrivateLink,services,version") throw new Error("topology policy has unsupported fields");
  if (policy.format !== "blog-x-topology-policy" || policy.version !== 1) throw new Error("topology policy format is unsupported");
  if (!policy.browser || typeof policy.browser !== "object" || Array.isArray(policy.browser)
    || Object.keys(policy.browser).sort().join(",") !== "directDataPlane,relativeRoutes"
    || policy.browser.directDataPlane !== false
    || JSON.stringify(policy.browser.relativeRoutes) !== JSON.stringify(["/api", "/media"])) throw new Error("topology policy must keep browser traffic relative");
  if (!policy.services || typeof policy.services !== "object" || Array.isArray(policy.services)
    || Object.keys(policy.services).sort().join(",") !== "api,postgres,web") throw new Error("topology policy services are invalid");
  const { web, api, postgres } = policy.services;
  if (!web || web.hostPublished !== true || web.bind !== "edge-only"
    || !api || api.hostPublished !== false
    || !postgres || postgres.hostPublished !== false) throw new Error("topology policy exposes a data plane");
  if (!policy.futurePrivateLink || policy.futurePrivateLink.required !== true || policy.futurePrivateLink.status !== "unresolved") {
    throw new Error("topology policy must retain unresolved private-link evidence");
  }
  return policy;
}

function exactSummaryCount(lines, name, parser) {
  const values = lines.filter((line) => parser.test(line)).map((line) => Number(line.replace(parser, "$1")));
  if (values.length !== 1) throw new Error(`semantic test output has an incomplete or conflicting ${name} footer`);
  return values[0];
}

export function parseSemanticTapResult(output) {
  const tap = String(output).replace(/\r\n?/g, "\n");
  const lines = tap.split("\n");
  if (!/^TAP version 13\s*$/m.test(tap)) throw new Error("semantic test output is not TAP version 13");
  const directive = lines.find((line) => /#\s*(?:SKIP|TODO)\b/i.test(line)
    && !/^\s*#\s*(?:skipped|todo)\s+\d+\s*$/i.test(line));
  if (directive) throw new Error(`semantic test output contains a skip/todo directive: ${redactText(directive)}`);
  const nonPassSummary = lines.find((line) => /^\s*#\s*(?:skipped|todo|cancelled|fail)\s+[1-9]\d*\s*$/i.test(line));
  if (nonPassSummary) throw new Error(`semantic test output contains a non-pass summary: ${redactText(nonPassSummary)}`);
  const tests = exactSummaryCount(lines, "tests", /^\s*#\s*tests\s+(\d+)\s*$/i);
  if (!tests) throw new Error("semantic test output reported zero semantic tests");
  const passed = exactSummaryCount(lines, "pass", /^\s*#\s*pass\s+(\d+)\s*$/i);
  const failed = exactSummaryCount(lines, "fail", /^\s*#\s*fail\s+(\d+)\s*$/i);
  const cancelled = exactSummaryCount(lines, "cancelled", /^\s*#\s*cancelled\s+(\d+)\s*$/i);
  const skipped = exactSummaryCount(lines, "skipped", /^\s*#\s*skipped\s+(\d+)\s*$/i);
  const todo = exactSummaryCount(lines, "todo", /^\s*#\s*todo\s+(\d+)\s*$/i);
  if (tests !== passed + failed + cancelled + skipped + todo) throw new Error("semantic test output footer arithmetic is inconsistent");
  if (!passed) throw new Error("semantic test output reported zero semantic tests");
  if (failed || cancelled || skipped || todo) throw new Error("semantic test output contains a non-pass result");
  return { tests, passed, failed, cancelled, skipped, todo };
}

export function assertSemanticTap(output) { return parseSemanticTapResult(output); }

export function parsePlaywrightResult(output) {
  const text = String(output).replace(/\r\n?/g, "\n");
  const running = [...text.matchAll(/^Running\s+(\d+)\s+tests?\s+using\s+\d+\s+workers?\s*$/gmi)];
  if (running.length !== 1) throw new Error("Playwright journey has an incomplete or conflicting launch count");
  const tests = Number(running[0][1]);
  const count = (name) => [...text.matchAll(new RegExp(`^\\s*(\\d+)\\s+${name}\\b`, "gmi"))].reduce((total, match) => total + Number(match[1]), 0);
  const passed = count("passed");
  const failed = count("failed");
  const skipped = count("skipped");
  const didNotRun = count("did not run");
  const flaky = count("flaky");
  const interrupted = count("interrupted");
  if (failed || skipped || didNotRun || flaky || interrupted) throw new Error("Playwright journey contains a non-pass result");
  if (!tests || !passed) throw new Error("Playwright journey reported zero completed tests");
  if (tests !== passed + failed + skipped + didNotRun) throw new Error("Playwright journey result count does not match launch count");
  return { tests, passed, failed, cancelled: interrupted, skipped, todo: 0 };
}

export function assertPlaywrightJourney(output) { return parsePlaywrightResult(output); }

export function parseBoundaryResult(output) {
  const lines = String(output).replace(/\r\n?/g, "\n").split("\n").filter((line) => line.startsWith("BLOG X BOUNDARY RESULT "));
  if (lines.length !== 1) throw new Error("repository boundary output is missing its machine result");
  let value;
  try { value = JSON.parse(lines[0].slice("BLOG X BOUNDARY RESULT ".length)); } catch { throw new Error("repository boundary result is invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "filesChecked,findings,outcome"
    || !Number.isSafeInteger(value.filesChecked) || value.filesChecked <= 0 || !Number.isSafeInteger(value.findings) || value.findings !== 0 || value.outcome !== "pass") {
    throw new Error("repository boundary result is not a complete pass");
  }
  return { tests: value.filesChecked, passed: value.filesChecked, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
}

export function semanticTestCommand(file) {
  return ["node", "--import", "tsx", "--test", "--test-reporter=tap", file];
}

export async function cleanupGeneratedMediaRoot(value) {
  const resolved = resolve(value ?? "");
  if (dirname(resolved) !== resolve(tmpdir()) || !/^blog-x-media-verify-[A-Za-z0-9_-]{6,64}$/.test(basename(resolved))) {
    throw new Error("cleanup target is not an exact generated media root");
  }
  await rm(resolved, { recursive: true, force: true });
}

export async function cleanupGeneratedMainBrowserRoot(value) {
  const resolved = resolve(value ?? "");
  if (dirname(resolved) !== resolve(tmpdir()) || !/^blog-x-main-browser-[A-Za-z0-9_-]{6,64}$/.test(basename(resolved))) {
    throw new Error("cleanup target is not an exact generated main-browser root");
  }
  await rm(resolved, { recursive: true, force: true });
}

export function redactText(text, secrets = []) {
  let redacted = String(text);
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  redacted = redacted
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/((?:set-)?cookie\s*:\s*[^\n]*blog_x_session=)[^;\s]+/gi, "$1[REDACTED]")
    .replace(/(blog_x_session=)[^;\s]+/gi, "$1[REDACTED]");
  return redacted;
}

function normalizeCapturedOutput(value, secrets) {
  return redactText(value, secrets)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n?/g, "\n");
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parserForSuiteKind(kind) {
  return ({ node: "node-tap-v13", database: "node-tap-v13", browser: "playwright-line-v1", pipeline: "production-backup-result-v1", boundary: "repository-boundary-result-v1" })[kind];
}

function sumCounts(records) {
  return records.reduce((total, item) => {
    for (const key of ["tests", "passed", "failed", "cancelled", "skipped", "todo"]) total[key] += item[key];
    return total;
  }, { tests: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
}

function assertPassOnlyCounts(counts, label) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)
    || Object.keys(counts).sort().join(",") !== "cancelled,failed,passed,skipped,tests,todo") {
    throw new Error(`${label} counts are incomplete`);
  }
  for (const key of ["tests", "passed", "failed", "cancelled", "skipped", "todo"]) {
    if (!Number.isSafeInteger(counts[key]) || counts[key] < 0) throw new Error(`${label} counts are invalid`);
  }
  if (!counts.tests || !counts.passed) throw new Error(`${label} counts reported zero tests`);
  if (counts.tests !== counts.passed + counts.failed + counts.cancelled + counts.skipped + counts.todo
    || counts.failed || counts.cancelled || counts.skipped || counts.todo) throw new Error(`${label} is not pass-only`);
  return counts;
}

export function createPhase6DataResult(suiteRecords) {
  if (!Array.isArray(suiteRecords)) throw new Error("Phase 6 data result requires exact suite records");
  const selection = phase6Selection("data");
  const expected = [
    ...selection.databaseSuites.map(([, id]) => ({ id, kind: "database" })),
    ...selection.nodeSuites.map((id) => ({ id, kind: "node" })),
    { id: selection.boundarySuite, kind: "boundary" },
  ];
  if (suiteRecords.length !== expected.length) throw new Error("Phase 6 data result exact suite selection is missing, duplicate, or contains extras");
  const suites = suiteRecords.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)
      || Object.keys(record).sort().join(",") !== "counts,id,kind"
      || typeof record.id !== "string" || typeof record.kind !== "string") {
      throw new Error("Phase 6 data result suite schema is invalid");
    }
    assertPassOnlyCounts(record.counts, `Phase 6 suite ${record.id}`);
    return { id: record.id, kind: record.kind, counts: { ...record.counts } };
  });
  const byId = new Map(suites.map((suite) => [suite.id, suite]));
  if (byId.size !== suites.length || expected.some(({ id, kind }) => byId.get(id)?.kind !== kind)) {
    throw new Error("Phase 6 data result suite selection is not exact");
  }
  const counts = sumCounts(suites.map((suite) => suite.counts));
  assertPassOnlyCounts(counts, "Phase 6 data result");
  return { format: PHASE6_DATA_RESULT_FORMAT, version: 1, suites, counts, releaseState: "BLOCKED" };
}

export function createPhase11DataResult(suiteRecords) {
  if (!Array.isArray(suiteRecords)) throw new Error("Phase 11 data result requires exact suite records");
  const selection = phase11Selection("data");
  const expected = [
    ...selection.databaseSuites.map(([, id]) => ({ id, kind: "database" })),
    { id: selection.restoreSuite, kind: "backup-restore" },
    ...selection.nodeSuites.map((id) => ({ id, kind: "node" })),
  ];
  if (suiteRecords.length !== expected.length) throw new Error("Phase 11 data result exact suite selection is missing, duplicate, or contains extras");
  const suites = suiteRecords.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)
      || Object.keys(record).sort().join(",") !== "counts,id,kind"
      || typeof record.id !== "string" || typeof record.kind !== "string") throw new Error("Phase 11 data result suite schema is invalid");
    assertPassOnlyCounts(record.counts, `Phase 11 suite ${record.id}`);
    return { id: record.id, kind: record.kind, counts: { ...record.counts } };
  });
  const byId = new Map(suites.map((suite) => [suite.id, suite]));
  if (byId.size !== suites.length || expected.some(({ id, kind }) => byId.get(id)?.kind !== kind)) throw new Error("Phase 11 data result suite selection is not exact");
  const counts = sumCounts(suites.map((suite) => suite.counts));
  assertPassOnlyCounts(counts, "Phase 11 data result");
  return { format: PHASE11_DATA_RESULT_FORMAT, version: 1, suites, counts, releaseState: "BLOCKED" };
}

function parsePhase6DataResultLine(output) {
  const lines = String(output).replace(/\r\n?/g, "\n").split("\n").filter((line) => line.startsWith(PHASE6_DATA_RESULT_PREFIX));
  if (lines.length !== 1) throw new Error("Phase 6 data output must contain exactly one machine result");
  let result;
  try { result = JSON.parse(lines[0].slice(PHASE6_DATA_RESULT_PREFIX.length)); } catch { throw new Error("Phase 6 data result is invalid JSON"); }
  const canonical = createPhase6DataResult(result?.suites);
  if (JSON.stringify(result) !== JSON.stringify(canonical)) throw new Error("Phase 6 data result schema or counts drifted");
  return { line: `${PHASE6_DATA_RESULT_PREFIX}${JSON.stringify(canonical)}`, result: canonical };
}

export function createPhase5ResultRecorder(manifest, secrets = []) {
  if (!manifest || manifest.format !== "blog-x-phase5-suite-manifest" || manifest.version !== 2 || !Array.isArray(manifest.suites)) throw new Error("Phase 5 result recorder requires a v2 manifest");
  const byId = new Map(manifest.suites.map((suite) => [suite.id, suite]));
  if (byId.size !== manifest.suites.length) throw new Error("Phase 5 result recorder manifest IDs are not unique");
  const entries = new Map();
  const record = (suiteId, parser, commandResult, counts, safeOutput) => {
    const suite = byId.get(suiteId);
    if (!suite || parser !== parserForSuiteKind(suite.kind)) throw new Error("Phase 5 result recorder received an unknown or mismatched suite");
    if (!commandResult || commandResult.exitCode !== 0 || commandResult.signal !== null) throw new Error("Phase 5 result recorder requires a successful completed command");
    const output = normalizeCapturedOutput(safeOutput ?? commandResult.combined, secrets);
    if (!output.length) throw new Error("Phase 5 result recorder requires captured output");
    const invocation = {
      ordinal: (entries.get(suiteId)?.length ?? 0) + 1,
      parser,
      startedAt: commandResult.startedAt,
      completedAt: commandResult.completedAt,
      exitCode: commandResult.exitCode,
      signal: commandResult.signal,
      redactedOutputBytes: Buffer.byteLength(output),
      redactedOutputSha256: hashText(output),
      counts,
    };
    if (!Number.isFinite(Date.parse(invocation.startedAt)) || !Number.isFinite(Date.parse(invocation.completedAt))) throw new Error("Phase 5 result recorder command timing is invalid");
    entries.set(suiteId, [...(entries.get(suiteId) ?? []), invocation]);
    return invocation;
  };
  return {
    recordCommand(suiteId, parser, commandResult, parserFunction) {
      return record(suiteId, parser, commandResult, parserFunction(commandResult.combined));
    },
    recordStructured(suiteId, parser, commandResult, value, counts) {
      return record(suiteId, parser, commandResult, counts, JSON.stringify(value));
    },
    finalize() {
      if (entries.size !== manifest.suites.length) throw new Error("Phase 5 result recorder is missing a manifest suite");
      return manifest.suites.map((suite) => {
        const invocations = entries.get(suite.id);
        if (!invocations?.length) throw new Error("Phase 5 result recorder is missing suite invocations");
        const counts = sumCounts(invocations.map((item) => item.counts));
        const resultRecord = {
          format: "blog-x-phase5-execution-result", version: 1, suiteId: suite.id, kind: suite.kind, sourceSha256: suite.sourceSha256,
          invocations, counts, outcome: "pass",
        };
        return { id: suite.id, sourceSha256: suite.sourceSha256, resultRecord, resultSha256: hashPhase5ResultRecord(resultRecord) };
      });
    },
    has(suiteId) { return entries.has(suiteId); },
  };
}

function recordPhase5Command(context, file, parser, result) {
  const suiteId = context.phase5SuiteIds?.get(file);
  if (!suiteId || !context.phase5Recorder) return;
  const parserFunction = parser === "node-tap-v13" ? parseSemanticTapResult : parsePlaywrightResult;
  context.phase5Recorder.recordCommand(suiteId, parser, result, parserFunction);
}

function generatedNamespace() {
  const namespace = validateNamespace(`blogxverify_${randomBytes(6).toString("hex")}`);
  allocatedGeneratedNamespaces.add(namespace);
  return namespace;
}

function generatedRestoreNamespace() {
  return `blogxrestore_${randomBytes(6).toString("hex")}`;
}

function generatedCleanupAuthority(namespace, webPort) {
  validateNamespace(namespace);
  const database = validateDatabaseName(`blog_x_${namespace.slice("blogxverify_".length)}`, namespace);
  const publicOrigin = validateLoopbackHttpOrigin(`http://127.0.0.1:${webPort}`);
  const authority = {
    namespace,
    database,
    webPort,
    publicOrigin,
    mediaVolume: validateMediaVolume(`${namespace}_media-data`, namespace),
  };
  allocatedGeneratedAuthorities.set(namespace, authority);
  return authority;
}

async function freePort() {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("unable to allocate a local verification port"));
      server.close(() => accept(address.port));
    });
  });
}

function command(commandName, args, options = {}) {
  return new Promise((accept, reject) => {
    if (!options.allowDuringShutdown) shutdownSignal?.throwIfAborted();
    const startedAt = new Date().toISOString();
    const child = spawn(commandName, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let combined = "";
    const abort = () => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    };
    if (!options.allowDuringShutdown) shutdownSignal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => { const value = String(chunk); stdout += value; combined += value; options.onOutput?.(value); });
    child.stderr.on("data", (chunk) => { const value = String(chunk); stderr += value; combined += value; options.onOutput?.(value); });
    child.on("error", (error) => {
      shutdownSignal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code, signal) => {
      shutdownSignal?.removeEventListener("abort", abort);
      const result = { startedAt, completedAt: new Date().toISOString(), exitCode: code ?? 1, signal: signal ?? null, stdout, stderr, combined };
      if (result.exitCode === 0 && result.signal === null || options.allowFailure) accept(result);
      else reject(Object.assign(new Error(`${commandName} exited with ${result.exitCode}`), { result }));
    });
  });
}

function composeEnvironment(context) {
  return {
    ...process.env,
    BLOG_X_API_IMAGE: apiImage,
    BLOG_X_WEB_IMAGE: webImage,
    BLOG_X_POSTGRES_DB: context.database,
    BLOG_X_POSTGRES_USER: "blog_x",
    BLOG_X_WEB_PORT: String(context.webPort),
    BLOG_X_PUBLIC_ORIGIN: context.publicOrigin,
  };
}

function composeArgs(context, ...args) {
  return ["-p", context.namespace, "-f", composeFile, ...(context.composeOverride ? ["-f", context.composeOverride] : []), ...args];
}

async function createCanonicalRuntimeAuthority(context, { includeWeb = true } = {}) {
  const runtimeRoot = await mkdtemp(resolve(root, "apps/.canonical-runtime-"));
  context.canonicalRuntimeRoot = runtimeRoot;
  const nextRoot = resolve(runtimeRoot, ".next");
  const override = resolve(runtimeRoot, "compose.override.yaml");
  if (includeWeb) await cp(resolve(root, "apps/web/.next"), nextRoot, { recursive: true });
  const yaml = [
    "services:",
    "  api:",
    "    volumes:",
    `      - ${JSON.stringify(`${resolve(root, "apps/api")}:/workspace/apps/api:ro`)}`,
    `      - ${JSON.stringify(`${resolve(root, "packages/contracts")}:/workspace/packages/contracts:ro`)}`,
    ...(includeWeb ? [
      "  web:",
      "    volumes:",
      `      - ${JSON.stringify(`${nextRoot}:/workspace/apps/web/.next`)}`,
    ] : []),
    "",
  ].join("\n");
  await writeFile(override, yaml, { mode: 0o600 });
  context.composeOverride = override;
}

async function cleanupCanonicalRuntimeAuthority(context) {
  if (!context.canonicalRuntimeRoot) return;
  const target = resolve(context.canonicalRuntimeRoot);
  if (dirname(target) !== resolve(root, "apps") || !/^\.canonical-runtime-[A-Za-z0-9_-]{6,64}$/.test(basename(target))) {
    throw new Error("canonical runtime cleanup target is invalid");
  }
  await rm(target, { recursive: true, force: true });
  try { await lstat(target); throw new Error("canonical runtime authority remained after cleanup"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  context.composeOverride = undefined;
  context.canonicalRuntimeRoot = undefined;
}

async function runStep(context, label, commandName, args, options = {}) {
  process.stdout.write(`[local-verify] ${label}\n`);
  try {
    const result = await command(commandName, args, { ...options, env: options.env ?? composeEnvironment(context) });
    context.logs.push(result.combined);
    return result;
  } catch (error) {
    const output = error?.result?.combined ?? error?.message ?? String(error);
    throw new Error(`${label} failed\n${redactText(output, context.secrets)}`);
  }
}

async function compose(context, label, ...args) {
  return runStep(context, label, "docker-compose", composeArgs(context, ...args));
}

async function waitForHttp(url, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    shutdownSignal?.throwIfAborted();
    try { if ((await fetch(url)).ok) return; } catch { /* service is still starting */ }
    await new Promise((accept) => setTimeout(accept, 250));
  }
  throw new Error(`timed out waiting for ${url}`);
}

function psqlArgs(context, query) {
  return ["exec", "-T", "postgres", "psql", "-U", "blog_x", "-d", context.database, "-Atqc", query];
}

async function inspectSchema(context) {
  const result = await compose(context, "inspect migration ledger and schema", ...psqlArgs(context, [
    "select (select count(*) from blog_x_schema_ledger),",
    "(select migration_count from blog_x_schema_ledger where scope = 'phase1'),",
    "(select count(*) from pg_tables where schemaname = 'public' and tablename = any(array['administrators','articles','article_daily_views','sessions','categories','tags','article_tags','site_pages','media','audit_events'])),",
    "(select count(*) from pg_constraint where conname = any(array['site_pages_key_about_check','site_pages_status_check','articles_cover_alt_check','articles_legacy_media_review_check','articles_schedule_pair_check','articles_schedule_draft_check','audit_events_event_check','audit_events_target_check','audit_events_metadata_check','article_daily_views_pkey','article_daily_views_article_id_articles_id_fk','article_daily_views_counters_nonnegative_check','article_daily_views_total_matches_sources_check'])),",
    "(select count(*) from pg_indexes where schemaname = 'public' and indexname = any(array['taxonomy_category_slug_unique','taxonomy_tag_slug_unique','article_tags_article_tag_unique','site_pages_key_unique','media_source_key_unique','media_derivative_key_unique','audit_events_newest_index','articles_schedule_due_index','article_daily_views_day_index']));",
  ].join(" ")));
  const values = result.stdout.trim().split("|").map(Number);
  if (values.length !== 5 || values[0] !== 1 || values[1] !== 10 || values[2] !== 10 || values[3] !== 13 || values[4] !== 9) {
    throw new Error(`unexpected schema inspection result: ${result.stdout.trim()}`);
  }
}

async function runMigration(context, label) {
  const currentAuthority = context.phase6Data || context.phase11Data || context.canonicalIntegration;
  return currentAuthority
    ? compose(context, label, "run", "--rm", "-T",
      "--volume", `${resolve(root, "apps/api")}:/workspace/apps/api:ro`,
      "--volume", `${resolve(root, "packages/contracts")}:/workspace/packages/contracts:ro`,
      "-e", `DATABASE_URL=${context.databaseUrl}`, "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:migrate")
    : compose(context, label, "run", "--rm", "-T", "-e", `DATABASE_URL=${context.databaseUrl}`, "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:migrate");
}

async function interruptionCheck(context) {
  const volume = `${context.namespace}_postgres-data`;
  const container = `${context.namespace}_migration_interrupt`;
  const before = await runStep(context, "record verification volume", "docker", ["volume", "inspect", "--format", "{{.CreatedAt}}", volume]);
  const started = await compose(context, "start interruptible migration", "run", "-d", "--name", container,
    "-e", `DATABASE_URL=${context.databaseUrl}`, "-e", "BLOG_X_MIGRATION_HOLD_MS=30000",
    "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:migrate");
  if (!started.stdout.trim()) throw new Error("interruptible migration container did not start");
  let marker = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const logs = await command("docker", ["logs", container], { allowFailure: true });
    if (logs.combined.includes("migration lock acquired")) { marker = true; break; }
    await new Promise((accept) => setTimeout(accept, 250));
  }
  if (!marker) throw new Error("migration did not reach the advisory-lock checkpoint");
  await runStep(context, "interrupt migration process", "docker", ["kill", container]);
  await runStep(context, "remove interrupted migration container", "docker", ["rm", "-f", container]);
  const removed = await command("docker", ["inspect", container], { allowFailure: true });
  if (removed.exitCode === 0) throw new Error("generated interruption container remained after removal");
  await Promise.all([runMigration(context, "retry migration A"), runMigration(context, "retry migration B")]);
  await inspectSchema(context);
  await migrationRetryPreservation(context);
  const advisoryLocks = await compose(context, "confirm migration advisory lock released", ...psqlArgs(context,
    "select count(*) from pg_locks where locktype = 'advisory' and granted;"));
  if (advisoryLocks.stdout.trim() !== "0") throw new Error("generated migration retained an advisory lock owner");
  const after = await runStep(context, "confirm verification volume identity", "docker", ["volume", "inspect", "--format", "{{.CreatedAt}}", volume]);
  if (before.stdout.trim() !== after.stdout.trim()) throw new Error("interruption recovery replaced the PostgreSQL volume");
}

async function migrationRetryPreservation(context) {
  const slug = `${context.runId}-migration-retained`;
  const legacyScheduleSlug = `${context.runId}-migration-legacy-draft`;
  await compose(context, "insert migration retry sentinel", ...psqlArgs(context,
    `insert into articles (title, slug, markdown, status) values ('Migration retry sentinel', '${slug}', 'retained source', 'draft'), ('Legacy schedule sentinel', '${legacyScheduleSlug}', 'retained schedule source', 'draft'); update articles set published_at = timestamptz '2030-01-01T00:00:00.000Z' where slug = '${legacyScheduleSlug}';`));
  await Promise.all([runMigration(context, "preservation retry migration A"), runMigration(context, "preservation retry migration B")]);
  await inspectSchema(context);
  const retained = await compose(context, "confirm migration retry preserved article", ...psqlArgs(context,
    `select count(*) from articles where slug = '${slug}' and markdown = 'retained source'; select count(*) from articles where slug = '${legacyScheduleSlug}' and published_at = timestamptz '2030-01-01T00:00:00.000Z' and scheduled_at is null and scheduled_by_administrator_id is null;`));
  if (retained.stdout.trim() !== "1\n1") throw new Error("migration retry did not preserve existing article and legacy draft publication state");
}

async function assertCleanLogs(context) {
  const result = await compose(context, "capture service logs", "logs", "--no-color", "postgres", "api", "web");
  const raw = `${context.logs.join("")}\n${result.combined}`;
  for (const secret of context.secrets) {
    if (secret && raw.includes(secret)) throw new Error("captured logs contain generated secret material");
  }
  if (/blog_x_session=[^;\s\[]/i.test(raw)) throw new Error("captured logs contain a session cookie value");
}

async function seed(context) {
  await compose(context, "seed generated administrator", "exec", "-T",
    "-e", `DATABASE_URL=${context.databaseUrl}`,
    "-e", `ADMIN_USERNAME=${context.username}`,
    "-e", `ADMIN_PASSWORD=${context.password}`,
    "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:seed");
}

async function resetAcceptanceData(context, label) {
  await compose(context, label, "exec", "-T", "postgres", "psql", "-U", "blog_x", "-d", context.database,
    "-c", "truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
  await seed(context);
}

async function seedMainBrowserScenario(context, file) {
  await resetAcceptanceData(context, `reset generated main-browser data for ${file}`);
  if (file === "apps/web/e2e/public-list.spec.ts") {
    const runId = context.runId;
    const query = [
      "insert into articles (title,summary,slug,markdown,status,published_at,deleted_at)",
      `select 'Editorial ${runId} ' || item, 'A concise summary for ${runId} article ' || item || '.', 'editorial-${runId}-' || item, '# Editorial ' || item, 'published', timestamptz '2026-08-01T12:00:00.000Z' - ((11-item) * interval '1 day'), null from generate_series(0,11) item;`,
      `insert into articles (title,summary,slug,markdown,status,published_at,deleted_at) values ('Private draft','hidden','private-draft-${runId}','# hidden','draft',null,null),('Downline post','hidden','downline-${runId}','# hidden','unpublished','2026-07-01T12:00:00.000Z',null),('Deleted post','hidden','deleted-${runId}','# hidden','published','2026-07-01T12:00:00.000Z','2026-07-02T12:00:00.000Z');`,
    ].join(" ");
    await compose(context, "seed generated public-list browser facts", ...psqlArgs(context, query));
  }
  if (file !== "apps/web/e2e/auth-session.spec.ts") return {};
  const expiredSessionToken = randomBytes(32).toString("base64url");
  const revokedSessionToken = randomBytes(32).toString("base64url");
  context.secrets.push(expiredSessionToken, revokedSessionToken);
  const query = [
    "insert into sessions (administrator_id,token_digest,expires_at,revoked_at)",
    `select id,'${hashText(expiredSessionToken)}',now()-interval '1 minute',null from administrators where username='${context.username}';`,
    "insert into sessions (administrator_id,token_digest,expires_at,revoked_at)",
    `select id,'${hashText(revokedSessionToken)}',now()+interval '1 day',now() from administrators where username='${context.username}';`,
  ].join(" ");
  await compose(context, "seed generated session browser facts", ...psqlArgs(context, query));
  return {
    E2E_EXPIRED_SESSION_TOKEN: expiredSessionToken,
    E2E_REVOKED_SESSION_TOKEN: revokedSessionToken,
  };
}

async function runMainBrowserSpec(context, file, environment) {
  const result = await runStep(context, `run ${file}`, "corepack",
    ["pnpm", "exec", "playwright", "test", file, "--workers=1"], { env: environment });
  return parsePlaywrightResult(result.combined);
}

async function resetGeneratedWebScenario(context, file) {
  await compose(context, `restart generated API rate authority for ${file}`, "restart", "api");
  await compose(context, `wait for generated API rate authority for ${file}`, "up", "-d", "--wait", "api");
  await compose(context, `recreate generated Web cache authority for ${file}`, "up", "-d", "--force-recreate", "--wait", "web");
  await waitForHttp(context.webOrigin);
}

async function runGeneratedMainBrowserFixtureSelection(context, runtime, selectedPaths) {
  validateMainBrowserContext(context);
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) throw new Error("main-browser fixture runtime must be an object");
  const allowedRuntimeKeys = new Set(["seedScenario", "resetWeb", "runSpec", "cleanupRoot"]);
  for (const name of Object.keys(runtime)) if (!allowedRuntimeKeys.has(name)) throw new Error(`main-browser fixture runtime field is invalid: ${name}`);
  const seedScenario = runtime.seedScenario ?? seedMainBrowserScenario;
  const resetWeb = runtime.resetWeb ?? resetGeneratedWebScenario;
  const runSpec = runtime.runSpec ?? runMainBrowserSpec;
  const cleanupRoot = runtime.cleanupRoot ?? cleanupGeneratedMainBrowserRoot;
  if (![seedScenario, resetWeb, runSpec, cleanupRoot].every((value) => typeof value === "function")) throw new Error("main-browser fixture runtime callbacks are invalid");

  const fixtureRoot = await mkdtemp(resolve(tmpdir(), "blog-x-main-browser-"));
  const paths = Object.freeze({
    root: fixtureRoot,
    backup: resolve(fixtureRoot, "backup"),
    media: resolve(fixtureRoot, "media"),
  });
  const suites = [];
  let result;
  try {
    await Promise.all([mkdir(paths.backup, { mode: 0o700 }), mkdir(paths.media, { mode: 0o700 })]);
    for (const [index, file] of selectedPaths.entries()) {
      const scenarioContext = { ...context, username: `${context.username}-${index + 1}` };
      const scenarioFacts = await seedScenario(scenarioContext, file, paths);
      await resetWeb(scenarioContext, file);
      const environment = createMainBrowserEnvironment(scenarioContext, scenarioFacts);
      const counts = assertPassOnlyCounts(await runSpec(scenarioContext, file, environment, paths), `main-browser suite ${file}`);
      suites.push({ path: file, counts: { ...counts } });
    }
    const counts = assertPassOnlyCounts(sumCounts(suites.map((suite) => suite.counts)), "generated main-browser fixture");
    result = {
      suites,
      counts,
      authority: {
        namespace: context.namespace,
        database: context.database,
        webOrigin: context.webOrigin,
        mediaVolume: context.mediaVolume,
        backupRoot: paths.backup,
        mediaRoot: paths.media,
      },
      releaseState: "BLOCKED",
    };
  } finally {
    await cleanupRoot(fixtureRoot);
    try {
      await lstat(fixtureRoot);
      throw new Error("generated main-browser root remained after cleanup");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return { ...result, cleanup: { pathsAbsent: true } };
}

export async function runGeneratedMainBrowserFixture(context, runtime = {}) {
  return runGeneratedMainBrowserFixtureSelection(context, runtime, migratedMainBrowserSelection());
}

async function runCanonicalMainBrowserFixture(context) {
  return runGeneratedMainBrowserFixtureSelection(context, {}, canonicalMainBrowserSelection());
}

async function runDatabaseSuite(context, variable, file) {
  const authority = [
    "-e", `DATABASE_URL=${context.databaseUrl}`,
    "-e", `${variable}=${context.databaseUrl}`,
  ];
  const result = context.phase6Data || context.phase11Data || context.canonicalIntegration
    ? await compose(context, `run ${file}`, "run", "--rm", "-T",
        "--volume", `${resolve(root, "apps/api")}:/workspace/apps/api:ro`,
        "--volume", `${resolve(root, "packages/contracts")}:/workspace/packages/contracts:ro`,
        ...authority, "api", ...semanticTestCommand(file))
    : await compose(context, `run ${file}`, "exec", "-T", ...authority, "api", ...semanticTestCommand(file));
  const counts = parseSemanticTapResult(result.combined);
  recordPhase5Command(context, file, "node-tap-v13", result);
  return counts;
}

function startManaged(context, label, commandName, args, env) {
  process.stdout.write(`[local-verify] ${label}\n`);
  const child = spawn(commandName, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const collect = (chunk) => { context.logs.push(String(chunk)); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  context.children.push(child);
  return child;
}

async function stopManaged(context) {
  const children = context.children.splice(0).reverse();
  await Promise.all(children.map((child) => new Promise((accept) => {
    if (child.exitCode !== null || child.signalCode !== null) return accept();
    child.once("close", accept);
    child.kill("SIGTERM");
    const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 3_000);
    timer.unref();
  })));
}

async function runFailureRecoveryJourney(context) {
  const [fixturePort, errorWebPort] = await Promise.all([freePort(), freePort()]);
  const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
  const errorWebOrigin = `http://127.0.0.1:${errorWebPort}`;
  startManaged(context, "start local unavailable-response fixture", process.execPath,
    ["--import", "tsx", "apps/web/e2e/public-error-fixture.ts"], { ...process.env, ERROR_FIXTURE_PORT: String(fixturePort) });
  await waitForHttp(`${fixtureOrigin}/health`);
  startManaged(context, "start local recovery Web", process.execPath,
    ["apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "-p", String(errorWebPort)],
    { ...process.env, INTERNAL_API_ORIGIN: fixtureOrigin, PUBLIC_ORIGIN: errorWebOrigin });
  await waitForHttp(errorWebOrigin);
  const browser = await runStep(context, "run Phase 2 unavailable/retry browser journey", "corepack",
    ["pnpm", "exec", "playwright", "test", "apps/web/e2e/public-errors.spec.ts", "--workers=1"],
    { env: { ...process.env, E2E_ERROR_WEB_ORIGIN: errorWebOrigin, E2E_ERROR_FIXTURE_ORIGIN: fixtureOrigin } });
  await stopManaged(context);
  return parsePlaywrightResult(browser.combined);
}

async function fullPhaseChecks(context, phase2Full) {
  await runStep(context, "typecheck workspace", "corepack", ["pnpm", "-r", "typecheck"], { env: process.env });
  await runStep(context, "build workspace", "corepack", ["pnpm", "-r", "build"], { env: { ...process.env, PUBLIC_ORIGIN: context.publicOrigin } });
  await runStep(context, "run operations safety fixtures", "corepack", ["pnpm", "test:ops"], { env: process.env });
  const databaseSuites = [
    ["AUTH_TEST_DATABASE_URL", "apps/api/test/auth-session.test.ts"],
    ["ARTICLE_TEST_DATABASE_URL", "apps/api/test/article-draft-preview.test.ts"],
    ["LIFECYCLE_TEST_DATABASE_URL", "apps/api/test/article-lifecycle.test.ts"],
    ["PUBLIC_LIST_TEST_DATABASE_URL", "apps/api/test/public-list.test.ts"],
    ["PUBLIC_VISIBILITY_TEST_DATABASE_URL", "apps/api/test/public-visibility.test.ts"],
    ...(phase2Full ? [
      ["AUTH_TEST_DATABASE_URL", "apps/api/test/taxonomy.test.ts"],
      ["AUTH_TEST_DATABASE_URL", "apps/api/test/pages-archive.test.ts"],
      ["AUTH_TEST_DATABASE_URL", "apps/api/test/media.test.ts"],
      ["PHASE2_TEST_DATABASE_URL", "apps/api/test/phase2-public-visibility.test.ts"],
    ] : []),
  ];
  for (const [variable, file] of databaseSuites) {
    await runDatabaseSuite(context, variable, file);
  }
  await resetAcceptanceData(context, "clear Phase acceptance data");
  const playwrightEnvironment = {
    ...process.env,
    E2E_WEB_ORIGIN: context.webOrigin,
    E2E_ADMIN_USERNAME: context.username,
    E2E_ADMIN_PASSWORD: context.password,
    E2E_RUN_ID: context.runId,
  };
  const journey = phase2Full ? "apps/web/e2e/phase2-reading.spec.ts" : "apps/web/e2e/phase1-publishing.spec.ts";
  const browser = await runStep(context, `run whole ${phase2Full ? "Phase 2" : "Phase 1"} browser journey`, "corepack", ["pnpm", "exec", "playwright", "test", journey, "--workers=1"], { env: playwrightEnvironment });
  assertPlaywrightJourney(browser.combined);
  recordPhase5Command(context, journey, "playwright-line-v1", browser);
  if (phase2Full) await runFailureRecoveryJourney(context);
  if (!phase2Full) {
    const retainedSlug = `${context.runId}-changed`;
    const retained = await compose(context, "verify soft-deleted source retention", ...psqlArgs(context,
      `select count(*) from articles where slug = '${retainedSlug}' and deleted_at is not null and length(markdown) > 0;`));
    if (retained.stdout.trim() !== "1") throw new Error("soft-deleted source/slug retention diagnostic failed");
  }
}

async function runPhase3Checks(context, mode) {
  const selection = phase3Selection(mode);
  for (const [variable, file] of selection.databaseSuites) await runDatabaseSuite(context, variable, file);
  if (selection.webSuites.length) await resetAcceptanceData(context, "clear Phase 3 browser acceptance data");
  for (const file of selection.webSuites) {
    if (file.endsWith(".test.ts")) {
      const result = await runStep(context, `run ${file}`, "corepack", ["pnpm", "exec", "tsx", "--test", "--test-reporter=tap", file], { env: process.env });
      assertSemanticTap(result.combined);
      recordPhase5Command(context, file, "node-tap-v13", result);
      continue;
    }
    const result = await runStep(context, `run ${file}`, "corepack", ["pnpm", "exec", "playwright", "test", file, "--workers=1"], {
      env: {
        ...process.env,
        E2E_WEB_ORIGIN: context.publicOrigin,
        E2E_ADMIN_USERNAME: context.username,
        E2E_ADMIN_PASSWORD: context.password,
        E2E_RUN_ID: context.runId,
      },
    });
    assertPlaywrightJourney(result.combined);
    recordPhase5Command(context, file, "playwright-line-v1", result);
  }
}

async function runPhase4SecurityChecks(context, options = {}) {
  const selection = phase4Selection("security");
  if (!options.skipWorkspace) {
    await runStep(context, "typecheck workspace", "corepack", ["pnpm", "-r", "typecheck"], { env: process.env });
    await runStep(context, "build workspace", "corepack", ["pnpm", "-r", "build"], { env: { ...process.env, PUBLIC_ORIGIN: context.publicOrigin } });
    await runStep(context, "run operations safety fixtures", "corepack", ["pnpm", "test:ops"], { env: process.env });
  }
  if (!options.skipPriorDatabase) for (const [variable, file] of selection.databaseSuites) await runDatabaseSuite(context, variable, file);
  for (const file of selection.apiSuites) await runDatabaseSuite(context, "AUTH_TEST_DATABASE_URL", file);
}

async function preflightCachedImages(context) {
  await runStep(context, "preflight exact cached base images", "docker", ["image", "inspect", "node:24.15.0-alpine", "postgres:18-alpine"]);
}

async function preflightOfflinePrerequisites(context) {
  process.stdout.write("[local-verify] preflight complete offline dependency and image authority\n");
  try {
    for (const path of ["package.json", "pnpm-lock.yaml", "node_modules", "node_modules/.pnpm"]) {
      const info = await lstat(resolve(root, path));
      if (path.startsWith("node_modules") ? !info.isDirectory() : !info.isFile()) throw new Error("dependency authority type mismatch");
    }
    await command("corepack", ["pnpm", "-r", "list", "--depth", "0"], { env: process.env });
    const images = await command("docker", ["image", "inspect", "--format", "{{.Id}}", "node:24.15.0-alpine", "postgres:18-alpine", apiImage, webImage]);
    const ids = images.stdout.trim().split(/\r?\n/);
    if (ids.length !== 4 || ids.some((id) => !/^sha256:[a-f0-9]{64}$/.test(id))) throw new Error("cached image identity is unavailable");
    for (const image of [apiImage, webImage]) {
      const history = await command("docker", ["history", "--no-trunc", image]);
      if (!/pnpm install --frozen-lockfile/.test(history.combined)) throw new Error("dependency installation cache record is unavailable");
    }
  } catch {
    throw new Error("OFFLINE PREREQUISITE MISSING: prepared dependency tree, pinned base images, verifier images, and install cache are required");
  }
}

async function exerciseApiRecovery(context) {
  const postgresVolume = `${context.namespace}_postgres-data`;
  const beforeVolumes = await Promise.all([postgresVolume, context.mediaVolume].map((volume) => command("docker", ["volume", "inspect", "--format", "{{.CreatedAt}}", volume])));
  const apiContainer = await compose(context, "resolve exact API container", "ps", "-q", "api");
  const containerId = apiContainer.stdout.trim();
  if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("exact API container could not be resolved");
  const before = await runStep(context, "record API restart count", "docker", ["inspect", "--format", "{{.RestartCount}}", containerId]);
  // Docker activates restart policies only after a container has stayed up for
  // roughly ten seconds; make that daemon contract explicit before fault injection.
  await new Promise((accept) => setTimeout(accept, 10_000));
  const processList = await runStep(context, "resolve actual API process", "docker", ["exec", containerId, "ps", "-o", "pid,ppid,args"]);
  const applicationLine = processList.stdout.split(/\r?\n/).find((line) => line.includes("src/app.ts") && line.includes("node --require"));
  const applicationPid = applicationLine?.trim().split(/\s+/, 1)[0];
  if (!applicationPid || !/^\d+$/.test(applicationPid) || applicationPid === "1") throw new Error("actual API application process could not be resolved");
  await runStep(context, "terminate generated API process", "docker", ["exec", containerId, "kill", "-KILL", applicationPid]);
  const deadline = Date.now() + 30_000;
  let recovered = false;
  let restartCount = Number(before.stdout.trim());
  while (Date.now() < deadline) {
    try {
      const current = await command("docker", ["inspect", "--format", "{{.RestartCount}}", containerId], { allowFailure: true });
      restartCount = Number(current.stdout.trim());
      if (restartCount > Number(before.stdout.trim())) {
        const response = await fetch(`${context.webOrigin}/api/health`);
        if (response.ok) { recovered = true; break; }
      }
    } catch { /* bounded recovery is still in progress */ }
    await new Promise((accept) => setTimeout(accept, 250));
  }
  if (!recovered) throw new Error("generated API did not recover through the Web origin within 30 seconds");
  process.stdout.write(`[local-verify] confirm API restart count ${restartCount}\n`);
  await compose(context, "wait for recovered service health", "up", "-d", "--wait", "api", "web");
  const afterVolumes = await Promise.all([postgresVolume, context.mediaVolume].map((volume) => command("docker", ["volume", "inspect", "--format", "{{.CreatedAt}}", volume])));
  if (beforeVolumes.some((value, index) => value.stdout.trim() !== afterVolumes[index].stdout.trim())) throw new Error("API recovery replaced a persistent volume");
}

async function runPhase4OperationsChecks(context) {
  const selection = phase4Selection("operations");
  process.stdout.write("[local-verify] inspect effective operations config\n");
  const effective = await command("docker-compose", composeArgs(context, "config", "--format", "json"), { env: composeEnvironment(context) });
  if (!effective.stdout.includes('"restart": "unless-stopped"') || !effective.stdout.includes('"driver": "local"')) throw new Error("effective operations config is missing lifecycle or log policy");
  for (const file of selection.nodeSuites) {
    const result = await runStep(context, `run ${file}`, "node", ["--test", "--test-reporter=tap", file], { env: process.env });
    assertSemanticTap(result.combined);
    recordPhase5Command(context, file, "node-tap-v13", result);
  }
  await exerciseApiRecovery(context);
  const status = await runStep(context, "run redacted local operator status", "node", ["scripts/ops-status.mjs", `--project=${context.namespace}`, `--web-origin=${context.webOrigin}`]);
  if (!status.stdout.includes("BLOG X STATUS PASS") || !status.stdout.includes("TLS NOT_EVALUATED")) throw new Error("local operator status did not pass with TLS not evaluated");
  const backupRoot = await mkdtemp(resolve(tmpdir(), "blog-x-backup-verify-"));
  try {
    process.stdout.write("[local-verify] create complete atomic backup set\n");
    const backup = await createBackupSet({
      format: "blog-x-backup-policy", version: 1, destination_root: backupRoot,
      off_host_destination_ref: "external:off-host-destination", retention_decision_ref: "external:retention-decision",
      encryption_key_ref: "external:encryption-authority", alert_recipient_ref: "external:alert-recipient",
      secret_authority_ref: "external:service-secret-authority", schedule: "daily",
      compose_project: context.namespace, database_name: context.database, media_root: "/var/lib/blog-x/media",
      config_inventory_sources: ["compose.yaml", "ops/production-config.names.json", "ops/topology-policy.json"],
    }, { env: composeEnvironment(context) });
    await verifyBackupSet(backup.finalRoot);
    process.stdout.write(`[local-verify] ${backup.message}\n`);
  } finally {
    await cleanupGeneratedBackupRoot(backupRoot);
  }
}

function generatedBackupPolicy(context, backupRoot) {
  return {
    format: "blog-x-backup-policy", version: 1, destination_root: backupRoot,
    off_host_destination_ref: "external:off-host-destination", retention_decision_ref: "external:retention-decision",
    encryption_key_ref: "external:encryption-authority", alert_recipient_ref: "external:alert-recipient",
    secret_authority_ref: "external:service-secret-authority", schedule: "daily",
    compose_project: context.namespace, database_name: context.database, media_root: "/var/lib/blog-x/media",
    config_inventory_sources: ["compose.yaml", "ops/production-config.names.json", "ops/topology-policy.json"],
  };
}

async function seedRestoreFixture(context, includePhase5Legacy = false) {
  await resetAcceptanceData(context, "clear restore source fixture data");
  await resetGeneratedAcceptanceMedia(context);
  const mediaId = "44444444-4444-4444-8444-444444444444";
  const categoryId = "11111111-1111-4111-8111-111111111111";
  const tagId = "22222222-2222-4222-8222-222222222222";
  const articleIds = [
    "33333333-3333-4333-8333-333333333331", "33333333-3333-4333-8333-333333333332",
    "33333333-3333-4333-8333-333333333333", "33333333-3333-4333-8333-333333333334",
    "33333333-3333-4333-8333-333333333335",
  ];
  const publishedSlug = `${context.runId}-restore-published`;
  const legacyArticleId = "66666666-6666-4666-8666-666666666666";
  const legacyArticleSlug = `${context.runId}-legacy-review-required`;
  const hiddenSlugs = ["draft", "offline", "deleted", "null-publication"].map((state) => `${context.runId}-restore-${state}`);
  const publishedTitle = `恢复演练公开文章 ${context.runId}`;
  const expectedAnalytics = [
    { articleId: articleIds[0], day: "2026-08-07", totalPv: 9, directPv: 2, internalPv: 1, searchPv: 3, socialPv: 1, externalPv: 2 },
    { articleId: articleIds[0], day: "2026-08-08", totalPv: 4, directPv: 0, internalPv: 2, searchPv: 0, socialPv: 1, externalPv: 1 },
    { articleId: articleIds[1], day: "2026-08-08", totalPv: 5, directPv: 1, internalPv: 0, searchPv: 1, socialPv: 2, externalPv: 1 },
  ];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const mediaRoot = await mkdtemp(resolve(tmpdir(), "blog-x-media-verify-"));
  try {
    const sourcePath = resolve(mediaRoot, `${mediaId}.bin`);
    const derivativePath = resolve(mediaRoot, `${mediaId}.png`);
    await writeFile(sourcePath, png);
    await writeFile(derivativePath, png);
    const api = await compose(context, "resolve source API for media fixture", "ps", "-q", "api");
    const containerId = api.stdout.trim();
    if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("source API container is unavailable for restore fixture");
    await runStep(context, "create source media fixture directories", "docker", ["exec", containerId, "mkdir", "-p", "/var/lib/blog-x/media/source", "/var/lib/blog-x/media/derivative"]);
    await runStep(context, "copy source media fixture", "docker", ["cp", sourcePath, `${containerId}:/var/lib/blog-x/media/source/${mediaId}.bin`]);
    await runStep(context, "copy derivative media fixture", "docker", ["cp", derivativePath, `${containerId}:/var/lib/blog-x/media/derivative/${mediaId}.png`]);
  } finally {
    await cleanupGeneratedMediaRoot(mediaRoot);
  }
  const timestamp = "2026-08-09T12:00:00.000Z";
  const query = [
    `insert into categories (id,name,slug,created_at,updated_at) values ('${categoryId}','恢复分类','restore-category','${timestamp}','${timestamp}');`,
    `insert into tags (id,name,slug,created_at,updated_at) values ('${tagId}','恢复标签','restore-tag','${timestamp}','${timestamp}');`,
    `insert into media (id,source_key,derivative_key,source_mime_type,derivative_mime_type,source_bytes,derivative_bytes,width,height,created_at) values ('${mediaId}','source/${mediaId}.bin','derivative/${mediaId}.png','image/png','image/png',${png.length},${png.length},1,1,'${timestamp}');`,
    `insert into articles (id,title,summary,slug,markdown,seo_description,status,published_at,created_at,updated_at,category_id,cover_media_id,cover_alt,cover_decorative) values ('${articleIds[0]}','${publishedTitle}','完整恢复后的公开摘要','${publishedSlug}','# 恢复正文\\n\\n![恢复图片](/media/${mediaId})','恢复演练','published','${timestamp}','${timestamp}','${timestamp}','${categoryId}','${mediaId}','恢复演练封面',false);`,
    `insert into articles (id,title,summary,slug,markdown,status,scheduled_at,scheduled_by_administrator_id,created_at,updated_at,category_id) values ('${articleIds[1]}','恢复草稿','draft-secret','${hiddenSlugs[0]}','# draft-secret','draft','2030-12-01T02:15:30.000Z',(select id from administrators limit 1),'${timestamp}','${timestamp}','${categoryId}');`,
    `insert into articles (id,title,summary,slug,markdown,status,published_at,created_at,updated_at) values ('${articleIds[2]}','恢复下线','offline-secret','${hiddenSlugs[1]}','# offline-secret','unpublished','${timestamp}','${timestamp}','${timestamp}');`,
    `insert into articles (id,title,summary,slug,markdown,status,published_at,deleted_at,created_at,updated_at) values ('${articleIds[3]}','恢复删除','deleted-secret','${hiddenSlugs[2]}','# deleted-secret','published','${timestamp}','${timestamp}','${timestamp}','${timestamp}');`,
    `insert into articles (id,title,summary,slug,markdown,status,published_at,created_at,updated_at) values ('${articleIds[4]}','恢复空发布时间','null-secret','${hiddenSlugs[3]}','# null-secret','published',null,'${timestamp}','${timestamp}');`,
    ...(includePhase5Legacy ? [`insert into articles (id,title,summary,cover_url,slug,markdown,status,published_at,created_at,updated_at) values ('${legacyArticleId}','遗留媒体复原文章','保留原始遗留媒体数据','https://images.example.test/legacy-cover.png','${legacyArticleSlug}','# 遗留媒体\\n\\n![历史图片](https://images.example.test/legacy-image.png)\\n\\n[外部文档](https://docs.example.test/legacy)','published','${timestamp}','${timestamp}','${timestamp}');`] : []),
    `insert into article_tags (article_id,tag_id) values ('${articleIds[0]}','${tagId}'),('${articleIds[1]}','${tagId}');`,
    ...expectedAnalytics.map((row) => `insert into article_daily_views (article_id,day,total_pv,direct_pv,internal_pv,search_pv,social_pv,external_pv) values ('${row.articleId}','${row.day}',${row.totalPv},${row.directPv},${row.internalPv},${row.searchPv},${row.socialPv},${row.externalPv});`),
    `insert into site_pages (id,key,title,markdown,status,version,created_at,updated_at) values ('55555555-5555-4555-8555-555555555555','about','恢复后的关于页','# 关于恢复','published','${timestamp}','${timestamp}','${timestamp}');`,
  ].join(" ");
  await compose(context, "seed retained restore authority fixture", ...psqlArgs(context, query));
  await runMigration(context, "classify retained restore media state");
  await inspectSchema(context);
  return { mediaId, publishedSlug, publishedTitle, hiddenSlugs, expectedAnalytics, ...(includePhase5Legacy ? { legacyArticleId, legacyArticleSlug } : {}) };
}

async function runPhase4RestoreChecks(context, includePhase5Legacy = false, browserSuite = phase4Selection("restore").browserSuite, options = {}) {
  const selection = phase4Selection("restore");
  if (!options.skipNodeSuites) for (const file of selection.nodeSuites) {
    const result = await runStep(context, `run ${file}`, "node", ["--test", "--test-reporter=tap", file], { env: process.env });
    assertSemanticTap(result.combined);
    recordPhase5Command(context, file, "node-tap-v13", result);
  }
  const fixture = await seedRestoreFixture(context, includePhase5Legacy);
  const backupRoot = await mkdtemp(resolve(tmpdir(), "blog-x-backup-verify-"));
  const restoreNamespace = generatedRestoreNamespace();
  const suffix = restoreNamespace.slice("blogxrestore_".length);
  const restorePort = await freePort();
  const restoreContext = {
    namespace: restoreNamespace, database: `blog_x_restore_${suffix}`, webPort: restorePort,
    publicOrigin: `http://127.0.0.1:${restorePort}`, webOrigin: `http://127.0.0.1:${restorePort}`,
    internalApiOrigin: context.internalApiOrigin,
    mediaVolume: `${restoreNamespace}_media-data`, logs: context.logs, secrets: context.secrets,
    phase5Recorder: context.phase5Recorder, phase5SuiteIds: context.phase5SuiteIds,
  };
  const restoreRoot = resolve(tmpdir(), `blog-x-restore-verify-${randomBytes(6).toString("hex")}`);
  let result;
  let primaryFailure;
  try {
    await runStep(context, "build Web for isolated restore origin", "corepack", ["pnpm", "--filter", "@blog-x/web", "build"], {
      env: {
        ...process.env,
        PUBLIC_ORIGIN: restoreContext.publicOrigin,
        INTERNAL_API_ORIGIN: restoreContext.internalApiOrigin,
      },
    });
    await createCanonicalRuntimeAuthority(restoreContext);
    process.stdout.write("[local-verify] create source backup for isolated restore\n");
    const backup = await createBackupSet(generatedBackupPolicy(context, backupRoot), { env: composeEnvironment(context) });
    await verifyBackupSet(backup.finalRoot);
    process.stdout.write("[local-verify] preflight and restore into generated namespace\n");
    const restored = await restoreBackupSet({
      backupRoot: backup.finalRoot, restoreRoot, namespace: restoreContext.namespace,
      database: restoreContext.database, mediaVolume: restoreContext.mediaVolume, webOrigin: restoreContext.webOrigin,
    }, { env: composeEnvironment(restoreContext), composeOverride: restoreContext.composeOverride });
    if (restored.message !== `RESTORE READY ${restoreContext.namespace}`) throw new Error("restore did not report its exact generated namespace");
    await waitForHttp(restoreContext.webOrigin);
    const api = await compose(restoreContext, "resolve restored API for authority comparison", "ps", "-q", "api");
    const containerId = api.stdout.trim();
    if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("restored API container is unavailable");
    await runStep(context, "create restored comparison root", "docker", ["exec", containerId, "mkdir", "-p", "/tmp/blog-x-restore-expected"]);
    await runStep(context, "copy immutable backup evidence for comparison", "docker", ["cp", `${backup.finalRoot}/.`, `${containerId}:/tmp/blog-x-restore-expected`]);
    const authorityEnvironment = [
      "-e", `DATABASE_URL=postgres://blog_x@postgres:5432/${restoreContext.database}`,
      "-e", `BACKUP_RESTORE_TEST_DATABASE_URL=postgres://blog_x@postgres:5432/${restoreContext.database}`,
      "-e", "BACKUP_RESTORE_EXPECTED_ROOT=/tmp/blog-x-restore-expected",
      "-e", "MEDIA_ROOT=/var/lib/blog-x/media",
      "-e", `BACKUP_RESTORE_EXPECTED_ANALYTICS=${JSON.stringify(fixture.expectedAnalytics)}`,
      ...(includePhase5Legacy ? ["-e", `PHASE5_LEGACY_ARTICLE_ID=${fixture.legacyArticleId}`] : []),
    ];
    const authority = await compose(restoreContext, `run ${selection.databaseSuite}`, "exec", "-T",
      ...authorityEnvironment, "api", ...semanticTestCommand(selection.databaseSuite));
    const databaseCounts = parseSemanticTapResult(authority.combined);
    recordPhase5Command(restoreContext, selection.databaseSuite, "node-tap-v13", authority);
    const browser = await runStep(context, `run ${browserSuite}`, "corepack",
      ["pnpm", "exec", "playwright", "test", browserSuite, "--workers=1"], {
        env: { ...process.env, E2E_WEB_ORIGIN: restoreContext.webOrigin, E2E_RESTORE_WEB_ORIGIN: restoreContext.webOrigin,
          E2E_RESTORE_PUBLISHED_SLUG: fixture.publishedSlug, E2E_RESTORE_PUBLISHED_TITLE: fixture.publishedTitle,
          E2E_RESTORE_MEDIA_ID: fixture.mediaId, E2E_RESTORE_HIDDEN_SLUGS: fixture.hiddenSlugs.join(","),
          ...(includePhase5Legacy ? { PHASE5_LEGACY_ARTICLE_ID: fixture.legacyArticleId, PHASE5_LEGACY_ARTICLE_SLUG: fixture.legacyArticleSlug } : {}) },
      });
    const browserCounts = parsePlaywrightResult(browser.combined);
    recordPhase5Command(context, browserSuite, "playwright-line-v1", browser);
    await verifyBackupSet(backup.finalRoot);
    result = { databaseCounts, browserCounts };
  } catch (error) {
    primaryFailure = error;
  } finally {
    const composeCleanup = await Promise.allSettled([
      convergeRestoreProjectCleanup(restoreContext),
    ]);
    const generatedCleanup = await Promise.allSettled([
      cleanupGeneratedRestoreRoot(restoreRoot),
      cleanupGeneratedBackupRoot(backupRoot),
      cleanupCanonicalRuntimeAuthority(restoreContext),
    ]);
    const cleanupFailures = [...composeCleanup, ...generatedCleanup]
      .filter((cleanup) => cleanup.status === "rejected")
      .map((cleanup) => cleanup.reason);
    const failures = [...(primaryFailure ? [primaryFailure] : []), ...cleanupFailures];
    if (failures.length) {
      const primaryDetail = primaryFailure instanceof Error ? redactText(primaryFailure.message, context.secrets) : "unknown restore failure";
      throw new AggregateError(failures, primaryFailure
        ? `isolated restore verification failed and all cleanup outcomes were retained: ${primaryDetail}`
        : "isolated restore cleanup did not converge");
    }
  }
  return result;
}

async function runPhase4ReleaseChecks(context) {
  const result = await runStep(context, "run scripts/release-gate.test.mjs", "node", ["--test", "--test-reporter=tap", "scripts/release-gate.test.mjs"], { env: process.env });
  assertSemanticTap(result.combined);
  recordPhase5Command(context, "scripts/release-gate.test.mjs", "node-tap-v13", result);
  const blocked = await runStep(context, "confirm canonical production release remains BLOCKED", "node",
    ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json", "--expect-blocked"], { env: process.env });
  if (!blocked.stdout.startsWith("RELEASE BLOCKED ")) throw new Error("canonical release evidence did not remain explicitly BLOCKED");
  context.canonicalDecision = blocked;
}

async function resetGeneratedAcceptanceMedia(context) {
  validateNamespace(context.namespace);
  validateMediaVolume(context.mediaVolume, context.namespace);
  const api = await compose(context, "resolve exact generated API for media fixture reset", "ps", "-q", "api");
  const containerId = api.stdout.trim();
  if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("generated API container is unavailable for media fixture reset");
  const program = [
    "const fs=require('node:fs');",
    "const root=process.env.MEDIA_ROOT;",
    "if(root!=='/var/lib/blog-x/media')process.exit(2);",
    "for(const name of ['source','derivative']){const target=root+'/'+name;fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true,mode:0o700});}",
  ].join("");
  await runStep(context, "reset only generated acceptance media fixtures", "docker", ["exec", containerId, "node", "-e", program]);
}

async function runPhase4FullChecks(context, options = {}) {
  phase4Selection("full");
  await fullPhaseChecks(context, true);
  await runPhase3Checks(context, "full");
  await runPhase4SecurityChecks(context, { skipWorkspace: true, skipPriorDatabase: true });
  await resetGeneratedAcceptanceMedia(context);
  await runPhase4OperationsChecks(context);
  await runPhase4RestoreChecks(context, options.includePhase5Legacy === true);
  await runPhase4ReleaseChecks(context);
  process.stdout.write("[local-verify] LOCAL PHASE 4 READINESS PASS; RELEASE BLOCKED\n");
}

async function runPhase6DataChecks(context) {
  const selection = phase6Selection("data");
  if (!context.internalRun) {
    await runStep(context, "typecheck workspace", "corepack", ["pnpm", "-r", "typecheck"], { env: process.env });
    await runStep(context, "build workspace", "corepack", ["pnpm", "-r", "build"], { env: { ...process.env, PUBLIC_ORIGIN: context.publicOrigin } });
  }
  await resetAcceptanceData(context, "clear Phase 6 data acceptance fixtures");
  const suites = [];
  for (const [variable, file] of selection.databaseSuites) {
    suites.push({ id: file, kind: "database", counts: await runDatabaseSuite(context, variable, file) });
  }
  for (const file of selection.nodeSuites) {
    const result = await runStep(context, `run ${file}`, "node", ["--test", "--test-reporter=tap", file], { env: process.env });
    assertSemanticTap(result.combined);
    suites.push({ id: file, kind: "node", counts: parseSemanticTapResult(result.combined) });
  }
  await inspectSchema(context);
  const boundary = await runStep(context, `run ${selection.boundarySuite}`, "corepack", ["pnpm", "check:boundaries"], { env: process.env });
  suites.push({ id: selection.boundarySuite, kind: "boundary", counts: parseBoundaryResult(boundary.combined) });
  const blocked = await runStep(context, "confirm canonical production release remains BLOCKED", "node",
    ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json", "--expect-blocked"], { env: process.env });
  if (!blocked.stdout.startsWith("RELEASE BLOCKED ")) throw new Error("canonical release evidence did not remain explicitly BLOCKED");
  const record = createPhase6DataResult(suites);
  process.stdout.write(`${PHASE6_DATA_RESULT_PREFIX}${JSON.stringify(record)}\n`);
  process.stdout.write("[local-verify] LOCAL PHASE 6 DATA PASS; RELEASE BLOCKED\n");
  return record;
}

async function runPhase11DataChecks(context) {
  const selection = phase11Selection("data");
  if (!context.internalRun) {
    await runStep(context, "typecheck workspace", "corepack", ["pnpm", "-r", "typecheck"], { env: process.env });
    await runStep(context, "build workspace", "corepack", ["pnpm", "-r", "build"], { env: { ...process.env, PUBLIC_ORIGIN: context.publicOrigin } });
  }
  await resetAcceptanceData(context, "clear Phase 11 data acceptance fixtures");
  const suites = [];
  for (const [variable, file] of selection.databaseSuites) {
    suites.push({ id: file, kind: "database", counts: await runDatabaseSuite(context, variable, file) });
  }
  const restore = await runPhase4RestoreChecks(context, false, phase4Selection("restore").browserSuite, { skipNodeSuites: true });
  suites.push({ id: selection.restoreSuite, kind: "backup-restore", counts: restore.databaseCounts });
  for (const file of selection.nodeSuites) {
    const result = await runStep(context, `run ${file}`, "node", ["--test", "--test-reporter=tap", file], { env: process.env });
    suites.push({ id: file, kind: "node", counts: assertSemanticTap(result.combined) });
  }
  await inspectSchema(context);
  const blocked = await runStep(context, "confirm canonical production release remains BLOCKED", "node",
    ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json", "--expect-blocked"], { env: process.env });
  if (!blocked.stdout.startsWith("RELEASE BLOCKED ")) throw new Error("canonical release evidence did not remain explicitly BLOCKED");
  const record = createPhase11DataResult(suites);
  process.stdout.write(`${PHASE11_DATA_RESULT_PREFIX}${JSON.stringify(record)}\n`);
  process.stdout.write("[local-verify] LOCAL PHASE 11 DATA PASS; RELEASE BLOCKED\n");
  return record;
}

const canonicalDatabaseEnvironment = Object.freeze({
  "apps/api/test/article-draft-preview.test.ts": "ARTICLE_TEST_DATABASE_URL",
  "apps/api/test/article-lifecycle.test.ts": "LIFECYCLE_TEST_DATABASE_URL",
  "apps/api/test/auth-session.test.ts": "AUTH_TEST_DATABASE_URL",
  "apps/api/test/distribution-export.test.ts": "PHASE3_TEST_DATABASE_URL",
  "apps/api/test/pages-archive.test.ts": "AUTH_TEST_DATABASE_URL",
  "apps/api/test/phase2-public-visibility.test.ts": "PHASE2_TEST_DATABASE_URL",
  "apps/api/test/public-discovery.test.ts": "PUBLIC_DISCOVERY_TEST_DATABASE_URL",
  "apps/api/test/public-distribution.test.ts": "PHASE3_TEST_DATABASE_URL",
  "apps/api/test/public-list.test.ts": "PUBLIC_LIST_TEST_DATABASE_URL",
  "apps/api/test/public-visibility.test.ts": "PUBLIC_VISIBILITY_TEST_DATABASE_URL",
  "apps/api/test/taxonomy.test.ts": "AUTH_TEST_DATABASE_URL",
});

async function runCanonicalIntegrationChecks(context) {
  const selection = canonicalIntegrationSelection();
  if (!context.internalRun && !context.canonicalPrebuilt) {
    await runStep(context, "typecheck workspace for canonical integration", "corepack", ["pnpm", "-r", "typecheck"], { env: process.env });
    await runStep(context, "build workspace for canonical integration", "corepack", ["pnpm", "-r", "build"], { env: { ...process.env, PUBLIC_ORIGIN: context.publicOrigin, INTERNAL_API_ORIGIN: context.internalApiOrigin } });
  }
  const suites = [];
  for (const file of selection.groups.database) {
    const variable = canonicalDatabaseEnvironment[file];
    if (!variable) throw new Error(`canonical database owner is unmapped: ${file}`);
    suites.push({ path: file, fixtureOwner: "database", counts: await runDatabaseSuite(context, variable, file) });
  }

  const mediaPath = selection.groups.media[0];
  await resetGeneratedAcceptanceMedia(context);
  suites.push({ path: mediaPath, fixtureOwner: "media", counts: await runDatabaseSuite(context, "AUTH_TEST_DATABASE_URL", mediaPath) });

  const mainBrowser = await runCanonicalMainBrowserFixture(context);
  for (const suite of mainBrowser.suites) suites.push({ path: suite.path, fixtureOwner: "main-browser", counts: suite.counts });

  suites.push({
    path: selection.groups["error-browser"][0],
    fixtureOwner: "error-browser",
    counts: await runFailureRecoveryJourney(context),
  });

  const restore = await runPhase4RestoreChecks(context, false, selection.groups["restore-browser"][0], { skipNodeSuites: true });
  suites.push({ path: selection.groups["backup-restore"][0], fixtureOwner: "backup-restore", counts: restore.databaseCounts });
  suites.push({ path: selection.groups["restore-browser"][0], fixtureOwner: "restore-browser", counts: restore.browserCounts });

  const ordered = selection.paths.map((path) => {
    const matches = suites.filter((suite) => suite.path === path);
    if (matches.length !== 1) throw new Error(`canonical integration path cardinality is not one: ${path}`);
    return matches[0];
  });
  if (suites.length !== ordered.length) throw new Error("canonical integration executed an extra package path");
  return ordered;
}

async function runPhase5MediaChecks(context, options = {}) {
  const selection = phase5MediaSelection();
  for (const [variable, file] of selection.databaseSuites) await runDatabaseSuite(context, variable, file);
  for (const file of selection.apiSuites) {
    const result = await compose(context, `run ${file}`, "exec", "-T", "api", ...semanticTestCommand(file));
    assertSemanticTap(result.combined);
    recordPhase5Command(context, file, "node-tap-v13", result);
  }
  for (const file of selection.nodeSuites) {
    const result = await runStep(context, `run ${file}`, "node", ["--test", "--test-reporter=tap", file], { env: process.env });
    assertSemanticTap(result.combined);
    recordPhase5Command(context, file, "node-tap-v13", result);
  }
  await resetAcceptanceData(context, "clear Phase 5 fresh-browser acceptance data");
  const freshBrowser = await runStep(context, `run ${selection.browserSuites[0]}`, "corepack",
    ["pnpm", "exec", "playwright", "test", selection.browserSuites[0], "--workers=1"], {
      env: {
        ...process.env,
        E2E_WEB_ORIGIN: context.webOrigin,
        E2E_ADMIN_USERNAME: context.username,
        E2E_ADMIN_PASSWORD: context.password,
        E2E_RUN_ID: context.runId,
      },
    });
  assertPlaywrightJourney(freshBrowser.combined);
  recordPhase5Command(context, selection.browserSuites[0], "playwright-line-v1", freshBrowser);
  if (options.includeRestore !== false) await runPhase4RestoreChecks(context, true, selection.browserSuites[1]);
}

function generatedProductionProject() {
  return `blogxprodverify_${randomBytes(6).toString("hex")}`;
}

function validateGeneratedProductionPath(value, prefix) {
  const target = resolve(value ?? "");
  if (dirname(target) !== resolve(tmpdir()) || !new RegExp(`^${prefix}-[A-Za-z0-9_-]{6,64}$`).test(basename(target))) {
    throw new Error("production-shaped cleanup target is not exact");
  }
  return target;
}

async function cleanupPhase5ProductionAuthorities(authorities) {
  for (const [path, prefix] of Object.entries(authorities)) {
    validateGeneratedProductionPath(path, prefix);
    await rm(path, { recursive: true, force: true });
  }
}

export async function createPhase5SuiteManifest() {
  const selection = phase5Selection("full");
  const sources = [
    ...selection.databaseSuites.map((item) => ["database", item[1]]),
    ...selection.apiSuites.map((path) => ["database", path]),
    ...selection.nodeSuites.map((path) => ["node", path]),
    ...selection.browserSuites.map((path) => ["browser", path]),
    ["database", selection.databaseSuite],
    ["pipeline", "scripts/backup/production-pipeline.mjs"],
    ["boundary", "scripts/check-boundaries.mjs"],
  ];
  const suites = await Promise.all(sources.map(async ([kind, path], index) => ({
    id: `suite-${String(index + 1).padStart(2, "0")}`,
    kind,
    path,
    sourceSha256: hashText(await readFile(resolve(root, path))),
  })));
  if (new Set(suites.map((suite) => suite.path)).size !== suites.length || suites.length !== 30) throw new Error("Phase 5 suite manifest must contain exactly 30 unique sources");
  return { format: "blog-x-phase5-suite-manifest", version: 2, suites };
}

async function runPhase5GeneratedPipeline() {
  const project = generatedProductionProject();
  const suffix = project.slice("blogxprodverify_".length);
  const authorities = {
    sourceBase: await mkdtemp(resolve(tmpdir(), "blog-x-production-source-")),
    mediaRoot: resolve(tmpdir(), `blog-x-production-media-${suffix}`),
    mountRoot: await mkdtemp(resolve(tmpdir(), "blog-x-production-mount-")),
    keyRoot: await mkdtemp(resolve(tmpdir(), "blog-x-production-key-")),
    resultRoot: await mkdtemp(resolve(tmpdir(), "blog-x-production-result-")),
    alertRoot: await mkdtemp(resolve(tmpdir(), "blog-x-production-alert-")),
  };
  try {
    await mkdir(authorities.mediaRoot, { mode: 0o700 });
    await Promise.all(Object.entries(authorities).filter(([name]) => name !== "sourceBase" && name !== "mediaRoot").map(([, path]) => chmod(path, 0o700)));
    const profileId = "blog-x-mounted-directory-v1";
    await writeFile(resolve(authorities.mountRoot, "identity.json"), JSON.stringify({ format: "blog-x-mounted-directory", version: 1, profileId }), { mode: 0o600 });
    const keyPath = resolve(authorities.keyRoot, "data.key");
    await writeFile(keyPath, randomBytes(32), { mode: 0o600 });
    const mediaId = "11111111-1111-4111-8111-111111111111";
    const source = Buffer.from(`phase5-source-${suffix}`);
    const derivative = Buffer.from(`phase5-derivative-${suffix}`);
    const inventoryDigest = hashText(`${project}-inventory`);
    const imageDigest = (name) => `sha256:${hashText(`${project}-${name}`)}`;
    const policy = {
      format: "blog-x-production-pipeline-policy", version: 1,
      sourceAuthority: { kind: "generated-test", sourceBase: authorities.sourceBase },
      collector: { project, database: `blog_x_prod_${suffix}`, mediaRoot: authorities.mediaRoot },
      destination: { kind: "generated-test", mountRoot: authorities.mountRoot, profileId },
      keyAuthority: { kind: "generated-test", keyPath },
      retention: { policyId: "daily-v1", minimumKnownGood: 1 },
      resultAuthority: { kind: "generated-test", root: authorities.resultRoot },
      alertAuthority: { kind: "generated-test", root: authorities.alertRoot },
    };
    const result = await runProductionPipeline(policy, {
      dumpPostgresCustom: async () => Buffer.from(`PGDMP-${project}`),
      writePortableExportV1: async () => JSON.stringify({ format: "blog-x-portable-export", version: 1, exportedAt: new Date().toISOString(), articles: [], categories: [], tags: [], about: null, media: [{ id: mediaId, width: 1, height: 1, mimeType: "image/webp", createdAt: new Date().toISOString() }] }),
      copyApiMedia: async () => [{ id: mediaId, sourceKey: `source/${mediaId}.bin`, derivativeKey: `derivative/${mediaId}.webp`, source, derivative }],
      readAllowlistedInventory: async () => ({
        migration: { count: 10, fingerprint: inventoryDigest },
        images: { api: imageDigest("api"), web: imageDigest("web"), postgres: imageDigest("postgres") },
        configChecksums: [{ path: "compose.yaml", sha256: hashText(await readFile(resolve(root, "compose.yaml"))) }],
        variableNamesPresent: ["DATABASE_URL", "MEDIA_ROOT", "PUBLIC_ORIGIN"],
        secretAuthorityRef: "external:service-secret-authority",
      }),
      inspectMount: async (mountRoot) => ({ isMountPoint: true, root: mountRoot }),
    });
    if (result.scope !== "generated-production-pipeline") throw new Error("generated production pipeline did not retain its exact local scope");
    return result;
  } finally {
    await cleanupPhase5ProductionAuthorities({
      [authorities.sourceBase]: "blog-x-production-source",
      [authorities.mediaRoot]: "blog-x-production-media",
      [authorities.mountRoot]: "blog-x-production-mount",
      [authorities.keyRoot]: "blog-x-production-key",
      [authorities.resultRoot]: "blog-x-production-result",
      [authorities.alertRoot]: "blog-x-production-alert",
    });
  }
}

async function committedImplementationHead({ writerAuthority } = {}) {
  const dirty = await command("git", ["status", "--porcelain"], { env: process.env });
  // The writer lock is deliberately held through the final HEAD check and the
  // atomic replace. It is verifier-owned coordination state, not an
  // implementation change; every other tracked or untracked path must remain
  // clean.
  const permittedLock = writerAuthority ? `?? ${writerAuthority.lockPath.slice(root.length + 1)}` : null;
  const unexpected = dirty.stdout.split("\n").filter((line) => line && line !== permittedLock);
  if (unexpected.length) throw new Error("Phase 5 receipt requires a clean committed implementation worktree");
  const head = await command("git", ["rev-parse", "HEAD"], { env: process.env });
  const revision = head.stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Phase 5 implementation revision is invalid");
  return revision;
}

async function runPhase5FullChecks(context) {
  const implementationRevision = context.implementationRevision;
  if (!/^[a-f0-9]{40}$/.test(implementationRevision ?? "")) throw new Error("Phase 5 full gate requires its pre-run committed implementation revision");
  const startedAt = new Date().toISOString();
  const manifest = await createPhase5SuiteManifest();
  context.phase5SuiteIds = new Map(manifest.suites.map((suite) => [suite.path, suite.id]));
  context.phase5Recorder = createPhase5ResultRecorder(manifest, context.secrets);
  await runPhase4FullChecks(context, { includePhase5Legacy: true });
  await runPhase5MediaChecks(context, { includeRestore: false });
  for (const file of [
    "scripts/backup/production.test.mjs",
    "scripts/phase5-receipt.test.mjs",
    "scripts/phase5-receipt-prohibitions.test.mjs",
    "scripts/phase5-receipt-concurrency.test.mjs",
  ]) {
    const result = await runStep(context, `run ${file}`, "node", ["--test", "--test-reporter=tap", file], { env: process.env });
    assertSemanticTap(result.combined);
    recordPhase5Command(context, file, "node-tap-v13", result);
  }
  const pipelineSuiteId = context.phase5SuiteIds.get("scripts/backup/production-pipeline.mjs");
  const pipelineRuns = await Promise.all([0, 1].map(async () => {
    const pipelineStartedAt = new Date().toISOString();
    const result = productionBackupResultSchema.parse(await runPhase5GeneratedPipeline());
    const commandResult = { startedAt: pipelineStartedAt, completedAt: new Date().toISOString(), exitCode: 0, signal: null, combined: "" };
    return { result, commandResult };
  }));
  const pipelineResults = pipelineRuns.map((run) => run.result);
  if (pipelineResults.some((result) => result.scope !== "generated-production-pipeline" || result.alertOutcome !== "recorded")
    || new Set(pipelineResults.map((result) => result.setId)).size !== 2 || new Set(pipelineResults.map((result) => result.receiptSha256)).size !== 2) {
    throw new Error("parallel generated production pipeline did not retain its local scope");
  }
  for (const run of pipelineRuns) context.phase5Recorder.recordStructured(pipelineSuiteId, "production-backup-result-v1", run.commandResult, run.result,
    { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
  const boundary = await runStep(context, "run Phase 5 boundary audit", "corepack", ["pnpm", "check:boundaries"], { env: process.env });
  const boundarySuiteId = context.phase5SuiteIds.get("scripts/check-boundaries.mjs");
  context.phase5Recorder.recordCommand(boundarySuiteId, "repository-boundary-result-v1", boundary, parseBoundaryResult);
  await runPhase4ReleaseChecks(context);
  if (!context.canonicalDecision) throw new Error("Phase 5 full gate did not capture its terminal canonical decision");
  const suites = context.phase5Recorder.finalize();
  context.phase5Receipt = {
    format: "blog-x-phase5-full-gate-receipt", version: 2, implementationRevision,
    command: ["corepack", "pnpm", "local:verify", "--", "--phase5-full", "--interruption-check", "--parallel-check"],
    mode: "phase5-full", scope: "local-generated-production-pipeline-and-fake-fault-only", startedAt, completedAt: new Date().toISOString(),
    suiteManifest: manifest, suiteManifestSha256: hashText(canonicalPhase5ResultBytes(manifest)), suites,
    canonicalEvidenceSha256: hashText(await readFile(resolve(root, "ops/release-evidence.blocked.json"))),
    canonicalDecisionSha256: hashText(normalizeCapturedOutput(context.canonicalDecision.combined, context.secrets)), canonicalDecisionState: "BLOCKED",
  };
  process.stdout.write("[local-verify] LOCAL PHASE 5 READINESS PASS; RELEASE BLOCKED\n");
}

async function restoreVerifierOwnedNextEnvironment(before) {
  const path = resolve(root, "apps/web/next-env.d.ts");
  const current = await readFile(path, "utf8");
  if (current !== before) await writeFile(path, before);
}

async function runSingle(options) {
  const namespace = validateNamespace(options.namespace ?? generatedNamespace());
  allocatedGeneratedNamespaces.add(namespace);
  const database = validateDatabaseName(`blog_x_${namespace.slice("blogxverify_".length)}`, namespace);
  const webPort = options.webPort ?? await freePort();
  const phaseLabel = options.canonicalIntegration ? "integration-" : options.lifecycleOnly ? "lifecycle-" : options.phase11Data ? "phase11-" : options.phase6Data ? "phase6-" : options.phase5Media || options.phase5Full ? "phase5-" : options.phase4Mode ? "phase4-" : options.phase3Mode ? "phase3-" : options.phase2Full ? "phase2-" : "phase1-";
  const runId = namespace.replace("blogxverify_", phaseLabel);
  const publicOrigin = validateLoopbackHttpOrigin(`http://127.0.0.1:${webPort}`);
  const context = {
    namespace,
    database,
    webPort,
    runId,
    webOrigin: publicOrigin,
    publicOrigin,
    internalApiOrigin: "http://api:3001",
    databaseUrl: `postgres://blog_x@postgres:5432/${database}`,
    username: `admin-${runId}`,
    password: randomBytes(24).toString("base64url"),
    mediaVolume: validateMediaVolume(`${namespace}_media-data`, namespace),
    logs: [],
    secrets: [],
    children: [],
    implementationRevision: options.implementationRevision,
    phase11Data: options.phase11Data,
    phase6Data: options.phase6Data,
    canonicalIntegration: options.canonicalIntegration,
    internalRun: options.internalRun,
  };
  allocatedGeneratedAuthorities.set(namespace, context);
  context.secrets.push(context.password, context.databaseUrl);
  if (context.publicOrigin === context.internalApiOrigin) throw new Error("public and internal API origins must remain separate");
  const nextEnvironmentBefore = await readFile(resolve(root, "apps/web/next-env.d.ts"), "utf8");
  let phase5Receipt;
  let canonicalSuites;

  try {
    // Lifecycle children use sealed cached images but must exercise the current
    // migration and schema verifier sources, just like the canonical parent.
    if (options.lifecycleOnly) await createCanonicalRuntimeAuthority(context, { includeWeb: false });
    if (options.phase6Data && !options.skipBuild) {
      await preflightOfflinePrerequisites(context);
      process.stdout.write("[local-verify] use prevalidated verifier dependency images with read-only committed integration sources\n");
    }
    else if (options.phase11Data && !options.skipBuild) {
      await preflightOfflinePrerequisites(context);
      process.stdout.write("[local-verify] use prevalidated verifier dependency images with read-only committed integration sources\n");
    }
    else if (options.canonicalIntegration && !options.skipBuild) {
      await preflightOfflinePrerequisites(context);
      process.stdout.write("[local-verify] build current canonical Web runtime from offline workspace authority\n");
      await runStep(context, "typecheck workspace for canonical integration", "corepack", ["pnpm", "-r", "typecheck"], { env: process.env });
      await runStep(context, "build workspace for canonical integration", "corepack", ["pnpm", "-r", "build"], { env: { ...process.env, PUBLIC_ORIGIN: context.publicOrigin, INTERNAL_API_ORIGIN: context.internalApiOrigin } });
      await createCanonicalRuntimeAuthority(context);
      context.canonicalPrebuilt = true;
    }
    else if (options.phase5Full && !options.skipBuild) {
      await preflightOfflinePrerequisites(context);
      process.stdout.write("[local-verify] use prevalidated local verifier images for the Phase 5 offline gate\n");
    }
    else if ((options.phase4Mode === "full" || options.phase5Media) && !options.skipBuild) await preflightOfflinePrerequisites(context);
    else if (["operations", "restore"].includes(options.phase4Mode) && !options.skipBuild) await preflightCachedImages(context);
    if (!options.skipBuild && !options.phase5Full && !options.phase6Data && !options.phase11Data && !options.canonicalIntegration) await compose(context, "build local API and Web images", "build", "api", "web");
    await compose(context, "start isolated PostgreSQL", "up", "-d", "--wait", "postgres");
    if (options.interruptionCheck && !options.canonicalIntegration) await interruptionCheck(context);
    else {
      await Promise.all([runMigration(context, "concurrent migration A"), runMigration(context, "concurrent migration B")]);
      await inspectSchema(context);
    }
    if (!options.interruptionCheck) await migrationRetryPreservation(context);
    await compose(context, "start isolated API and Web", "up", "-d", "--wait", "api", "web");
    await runStep(context, "confirm exact generated media volume", "docker", ["volume", "inspect", context.mediaVolume]);
    await waitForHttp(context.webOrigin);
    const currentSchemaAuthority = options.phase6Data || options.phase11Data || options.canonicalIntegration;
    await compose(context, "verify active schema", ...(currentSchemaAuthority
      ? ["run", "--rm", "-T", "--volume", `${resolve(root, "apps/api")}:/workspace/apps/api:ro`, "--volume", `${resolve(root, "packages/contracts")}:/workspace/packages/contracts:ro`, "-e", `DATABASE_URL=${context.databaseUrl}`]
      : ["exec", "-T", "-e", `DATABASE_URL=${context.databaseUrl}`]),
    "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:schema:verify");
    await seed(context);
    if (options.lifecycleOnly) {
      const interruption = options.interruptAfterReady ? new Promise((_accept, reject) => {
        const keepAlive = setInterval(() => {}, 1_000);
        const rejectForShutdown = () => {
          clearInterval(keepAlive);
          reject(shutdownSignal.reason);
        };
        if (shutdownSignal?.aborted) rejectForShutdown();
        else shutdownSignal?.addEventListener("abort", rejectForShutdown, { once: true });
      }) : undefined;
      process.stdout.write(`[local-verify] LIFECYCLE READY ${namespace}\n`);
      if (interruption) await interruption;
    }
    else if (options.canonicalIntegration) {
      canonicalSuites = await runCanonicalIntegrationChecks(context);
    }
    else if (options.phase6Data) {
      await runPhase6DataChecks(context);
    }
    else if (options.phase11Data) {
      await runPhase11DataChecks(context);
    }
    else if (options.phase4Mode === "security") {
      await runPhase4SecurityChecks(context);
    }
    else if (options.phase4Mode === "operations") {
      await runPhase4OperationsChecks(context);
    }
    else if (options.phase4Mode === "restore") {
      await runPhase4RestoreChecks(context);
    }
    else if (options.phase4Mode === "full") {
      await runPhase4FullChecks(context);
    }
    else if (options.phase5Full) {
      await runPhase5FullChecks(context);
      phase5Receipt = context.phase5Receipt;
    }
    else if (options.phase5Media) {
      await runPhase5MediaChecks(context);
    }
    else if (options.phase3Mode === "full") {
      await fullPhaseChecks(context, true);
      await runPhase3Checks(context, "full");
    }
    else if (options.phase3Mode) await runPhase3Checks(context, options.phase3Mode);
    else if (options.fullPhase) await fullPhaseChecks(context, options.phase2Full);
    await assertCleanLogs(context);
    process.stdout.write(`[local-verify] ${namespace} passed\n`);
  } catch (error) {
    if (options.canonicalIntegration) {
      const diagnostics = await command("docker-compose", composeArgs(context, "logs", "--no-color", "api", "web"), {
        env: composeEnvironment(context), allowFailure: true, allowDuringShutdown: true,
      });
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${redactText(diagnostics.combined, context.secrets)}`);
    }
    throw error;
  } finally {
    const cleanup = await Promise.allSettled([
      (async () => {
        await stopManaged(context);
        validateNamespace(context.namespace);
        validateDatabaseName(context.database, context.namespace);
        validateMediaVolume(context.mediaVolume, context.namespace);
        try {
          await convergeGeneratedProjectCleanup(context);
        } finally {
          await cleanupCanonicalRuntimeAuthority(context);
        }
      })(),
      restoreVerifierOwnedNextEnvironment(nextEnvironmentBefore),
    ]);
    const cleanupFailures = cleanup.filter((result) => result.status === "rejected");
    if (cleanupFailures.length) {
      throw new AggregateError(cleanupFailures.map((result) => result.reason), "generated verification cleanup did not converge");
    }
    process.stdout.write("[local-verify] GENERATED CLEANUP PASS\n");
  }
  return options.canonicalIntegration
    ? {
        suites: canonicalSuites,
        cleanup: { namespace, containersAbsent: true, volumesAbsent: true, pathsAbsent: true },
      }
    : phase5Receipt;
}

async function parallelCheck(options) {
  const first = generatedNamespace();
  const second = generatedNamespace();
  if (first === second) throw new Error("parallel verification namespaces collided");
  const [firstPort, secondPort] = await Promise.all([freePort(), freePort()]);
  if (firstPort === secondPort) throw new Error("parallel verification ports collided");
  const childMode = options.phase6Data ? "--phase6-data" : ["restore", "full"].includes(options.phase4Mode) ? "--phase4-restore" : "--infrastructure-only";
  const child = (namespace, webPort) => command(process.execPath,
    options.phase6Data
      ? [scriptPath, "--internal-run", "--phase6-data", "--skip-build", `--namespace=${namespace}`, `--web-port=${webPort}`]
      : [scriptPath, "--internal-run", childMode, "--skip-build", `--namespace=${namespace}`, `--web-port=${webPort}`],
    { env: process.env });
  process.stdout.write("[local-verify] run two isolated namespaces in parallel\n");
  const settled = await Promise.allSettled([child(first, firstPort), child(second, secondPort)]);
  const failed = settled.find((item) => item.status === "rejected");
  if (failed) {
    const output = failed.reason?.result?.combined ?? failed.reason?.message ?? "parallel child failed";
    throw new Error(`parallel verification child failed\n${redactText(output)}`);
  }
  const results = settled.map((item) => item.value);
  if (!results[0].stdout.includes(`${first} passed`) || !results[1].stdout.includes(`${second} passed`)) {
    throw new Error("parallel verification did not preserve namespace identity");
  }
  if (options.phase6Data && results.some((result) => !result.stdout.includes("LOCAL PHASE 6 DATA PASS; RELEASE BLOCKED"))) {
    throw new Error("parallel Phase 6 child omitted its terminal data-pass/BLOCKED marker");
  }
  if (options.phase6Data) {
    const records = results.map((result) => parsePhase6DataResultLine(result.combined));
    if (JSON.stringify(records[0].result) !== JSON.stringify(records[1].result)) {
      throw new Error("parallel Phase 6 child result counts or schema drifted");
    }
    for (const [index, namespace] of [first, second].entries()) {
      process.stdout.write(`${records[index].line}\n`);
      if (!results[index].stdout.includes("GENERATED CLEANUP PASS")) {
        throw new Error("parallel Phase 6 child omitted exact generated cleanup proof");
      }
      process.stdout.write("[local-verify] GENERATED PARALLEL CLEANUP PASS\n");
      process.stdout.write(`[local-verify] ${namespace} parallel child passed; LOCAL PHASE 6 DATA PASS; RELEASE BLOCKED\n`);
    }
  }
  await Promise.all([confirmGeneratedProjectAbsent(first), confirmGeneratedProjectAbsent(second)]);
}

function parseLifecycleCleanup(output, namespace) {
  const lines = String(output).replace(/\r\n?/g, "\n").split("\n").filter((line) => line.startsWith(LIFECYCLE_CLEANUP_PREFIX));
  if (lines.length !== 1) throw new Error("lifecycle child must emit exactly one cleanup acknowledgement");
  let record;
  try { record = JSON.parse(lines[0].slice(LIFECYCLE_CLEANUP_PREFIX.length)); } catch { throw new Error("lifecycle cleanup acknowledgement is invalid JSON"); }
  if (!record || record.format !== "blog-x-generated-lifecycle-cleanup" || record.version !== 1
    || record.namespace !== namespace || record.containersAbsent !== true || record.volumesAbsent !== true
    || record.pathsAbsent !== true || record.releaseState !== "BLOCKED") {
    throw new Error("lifecycle cleanup acknowledgement is incomplete");
  }
  return record;
}

function runLifecycleChild(namespace, webPort, interrupt) {
  validateNamespace(namespace);
  const args = [scriptPath, "--internal-run", "--lifecycle-only", "--skip-build", `--namespace=${namespace}`, `--web-port=${webPort}`];
  if (interrupt) args.push("--interrupt-after-ready");
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let ready = false;
    let terminated = false;
    const collect = (chunk) => {
      output += String(chunk);
      if (interrupt && !terminated && output.includes(`LIFECYCLE READY ${namespace}`)) {
        ready = true;
        terminated = child.kill("SIGTERM");
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      try {
        if (!output.includes(`LIFECYCLE READY ${namespace}`)) throw new Error("lifecycle child never became ready");
        if (interrupt && (!ready || !terminated || (code === 0 && signal === null))) throw new Error("lifecycle interruption did not terminate the ready child");
        if (!interrupt && (code !== 0 || signal !== null)) throw new Error("parallel lifecycle child failed");
        parseLifecycleCleanup(output, namespace);
        accept({ namespace, output });
      } catch (error) {
        reject(new Error(`${error.message}\n${redactText(output)}`));
      }
    });
  });
}

async function runLifecycleChildWithRecovery(namespace, webPort, interrupt) {
  const authority = generatedCleanupAuthority(namespace, webPort);
  const child = await Promise.allSettled([runLifecycleChild(namespace, webPort, interrupt)]);
  const cleanup = await Promise.allSettled([convergeGeneratedProjectCleanup(authority)]);
  const failures = [...child, ...cleanup].filter((result) => result.status === "rejected");
  if (failures.length) {
    throw new AggregateError(failures.map((result) => result.reason), `lifecycle child ${namespace} did not converge`);
  }
  return child[0].value;
}

async function runLifecycleInterruptionProbe() {
  const namespace = generatedNamespace();
  const webPort = await freePort();
  await runLifecycleChildWithRecovery(namespace, webPort, true);
  return createLifecycleProbeResult({ kind: "interruption", namespaces: [namespace], interrupted: true });
}

async function runLifecycleParallelProbe() {
  const namespaces = [generatedNamespace(), generatedNamespace()];
  const ports = await Promise.all([freePort(), freePort()]);
  if (new Set(namespaces).size !== 2 || new Set(ports).size !== 2) throw new Error("parallel lifecycle authorities collided");
  const settled = await Promise.allSettled(namespaces.map((namespace, index) => runLifecycleChildWithRecovery(namespace, ports[index], false)));
  const failures = settled.filter((result) => result.status === "rejected");
  if (failures.length) {
    throw new Error(failures.map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)).join("\n"));
  }
  return createLifecycleProbeResult({ kind: "parallel", namespaces, interrupted: false });
}

function emitCanonicalIntegrationCleanupAcknowledgement() {
  const namespaces = [...allocatedGeneratedNamespaces].sort();
  if (!namespaces.length || namespaces.some((namespace) => !confirmedGeneratedNamespaces.has(namespace))) {
    throw new Error("not every allocated canonical integration namespace has confirmed cleanup");
  }
  const record = {
    format: "blog-x-generated-integration-cleanup",
    version: 1,
    namespaces: namespaces.map((namespace) => ({ namespace, containersAbsent: true, volumesAbsent: true, pathsAbsent: true })),
    releaseState: "BLOCKED",
  };
  process.stdout.write(`${GENERATED_INTEGRATION_CLEANUP_PREFIX}${JSON.stringify(record)}\n`);
}

async function confirmGeneratedProjectAbsent(namespace, options = {}) {
  validateNamespace(namespace);
  const containers = await command("docker", ["ps", "-aq", "--filter", `label=com.docker.compose.project=${namespace}`], options);
  if (containers.stdout.trim()) throw new Error(`generated project ${namespace} retained a container`);
  for (const volume of [`${namespace}_postgres-data`, `${namespace}_media-data`]) {
    const inspected = await command("docker", ["volume", "inspect", volume], { allowFailure: true, ...options });
    if (inspected.exitCode === 0) throw new Error(`generated project ${namespace} retained volume ${volume}`);
  }
  confirmedGeneratedNamespaces.add(namespace);
}

async function confirmRestoreProjectAbsent(context, options = {}) {
  const namespace = validateRestoreNamespace(context.namespace);
  validateRestoreDatabase(context.database, namespace);
  const postgresVolume = `${namespace}_postgres-data`;
  const mediaVolume = validateRestoreMediaVolume(context.mediaVolume, namespace);
  const containers = await command("docker", ["ps", "-aq", "--filter", `label=com.docker.compose.project=${namespace}`], options);
  if (containers.stdout.trim()) throw new Error(`restore project ${namespace} retained a container`);
  for (const volume of [postgresVolume, mediaVolume]) {
    const inspected = await command("docker", ["volume", "inspect", volume], { ...options, allowFailure: true });
    if (inspected.exitCode === 0) throw new Error(`restore project ${namespace} retained volume ${volume}`);
    if (!/no such volume/i.test(`${inspected.stdout}\n${inspected.stderr}`)) {
      throw new Error(`restore project ${namespace} volume absence could not be confirmed for ${volume}`);
    }
  }
}

async function convergeRestoreProjectCleanup(context) {
  const namespace = validateRestoreNamespace(context.namespace);
  validateRestoreDatabase(context.database, namespace);
  validateRestoreMediaVolume(context.mediaVolume, namespace);
  const failures = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const down = await command("docker-compose", composeArgs(context, "down", "--remove-orphans", "--volumes"), {
      env: composeEnvironment(context), allowFailure: true, allowDuringShutdown: true,
    });
    try {
      await confirmRestoreProjectAbsent(context, { allowDuringShutdown: true });
      return;
    } catch (error) {
      failures.push(new AggregateError([
        new Error(`restore cleanup attempt ${attempt + 1} down exit ${down.exitCode}`),
        error,
      ], `restore cleanup attempt ${attempt + 1} did not confirm absence`));
      if (attempt === 0) await new Promise((accept) => setTimeout(accept, 200));
    }
  }
  throw new AggregateError(failures, `restore project ${namespace} cleanup did not converge`);
}

async function convergeGeneratedProjectCleanup(context) {
  validateNamespace(context.namespace);
  validateDatabaseName(context.database, context.namespace);
  validateMediaVolume(context.mediaVolume, context.namespace);
  const failures = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const down = await command("docker-compose", composeArgs(context, "down", "--remove-orphans", "--volumes"), {
      env: composeEnvironment(context), allowFailure: true, allowDuringShutdown: true,
    });
    try {
      await confirmGeneratedProjectAbsent(context.namespace, { allowDuringShutdown: true });
      return;
    } catch (error) {
      failures.push(new Error(`generated cleanup attempt ${attempt + 1} down exit ${down.exitCode}`), error);
      if (attempt === 0) await new Promise((accept) => setTimeout(accept, 200));
    }
  }
  throw new AggregateError(failures, `generated project ${context.namespace} cleanup did not converge`);
}

async function convergeAllocatedGeneratedAuthorities() {
  const results = await Promise.allSettled([...allocatedGeneratedNamespaces].map((namespace) => {
    const authority = allocatedGeneratedAuthorities.get(namespace);
    return authority
      ? convergeGeneratedProjectCleanup(authority)
      : confirmGeneratedProjectAbsent(namespace, { allowDuringShutdown: true });
  }));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "allocated generated cleanup did not converge");
}

function emitLifecycleCleanupAcknowledgement(namespace) {
  if (!confirmedGeneratedNamespaces.has(namespace)) throw new Error("lifecycle namespace cleanup is not confirmed");
  const record = {
    format: "blog-x-generated-lifecycle-cleanup",
    version: 1,
    namespace,
    containersAbsent: true,
    volumesAbsent: true,
    pathsAbsent: true,
    releaseState: "BLOCKED",
  };
  process.stdout.write(`${LIFECYCLE_CLEANUP_PREFIX}${JSON.stringify(record)}\n`);
}

function emitPhase6CleanupAcknowledgement() {
  const namespaces = [...allocatedGeneratedNamespaces].sort();
  if (!namespaces.length || namespaces.some((namespace) => !confirmedGeneratedNamespaces.has(namespace))) {
    throw new Error("not every allocated Phase 6 namespace has confirmed cleanup");
  }
  const record = {
    format: "blog-x-phase6-cleanup-ack",
    version: 1,
    namespaces: namespaces.map((namespace) => ({
      namespace,
      containersAbsent: true,
      volumes: [`${namespace}_postgres-data`, `${namespace}_media-data`],
      volumesAbsent: true,
    })),
    releaseState: "BLOCKED",
  };
  process.stdout.write(`BLOG X PHASE6 CLEANUP ACK ${JSON.stringify(record)}\n`);
}

function optionValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const flags = new Set(argumentsList);
  const phase3Modes = ["api", "metadata", "full", "export-api", "export-browser"].filter((mode) => flags.has(`--phase3-${mode}`));
  const phase4Modes = ["security", "operations", "restore", "full"].filter((mode) => flags.has(`--phase4-${mode}`));
  const phase5Media = flags.has("--phase5-media");
  const phase5Full = flags.has("--phase5-full");
  const phase6Data = flags.has("--phase6-data");
  const phase11Data = flags.has("--phase11-data");
  const canonicalIntegration = flags.has("--canonical-integration");
  const lifecycleOnly = flags.has("--lifecycle-only");
  if (phase3Modes.length + phase4Modes.length + Number(phase5Media) + Number(phase5Full) + Number(phase6Data) + Number(phase11Data) + Number(canonicalIntegration) + Number(lifecycleOnly) > 1) {
    throw new Error("choose at most one Phase 3, Phase 4, Phase 5, Phase 6, Phase 11, canonical integration, or lifecycle selection");
  }
  const options = {
    namespace: optionValue("namespace"),
    webPort: optionValue("web-port") ? Number(optionValue("web-port")) : undefined,
    phase2Full: flags.has("--phase2-full"),
    phase3Mode: phase3Modes[0],
    phase4Mode: phase4Modes[0],
    phase5Media,
    phase5Full,
    phase6Data,
    phase11Data,
    canonicalIntegration,
    lifecycleOnly,
    interruptAfterReady: flags.has("--interrupt-after-ready"),
    internalRun: flags.has("--internal-run"),
    fullPhase: !phase4Modes.length && !phase5Media && !phase5Full && !phase6Data && !phase11Data && !canonicalIntegration && !lifecycleOnly && (flags.has("--full-phase") || flags.has("--phase2-full") || (!flags.has("--infrastructure-only") && !flags.has("--internal-run"))),
    interruptionCheck: flags.has("--interruption-check"),
    parallelCheck: flags.has("--parallel-check"),
    skipBuild: flags.has("--skip-build"),
  };

  if (flags.has("--internal-run") && phase5Full) throw new Error("internal verification children cannot acquire Phase 5 receipt authority");
  const phase11Arguments = argumentsList.filter((argument) => argument !== "--");
  if (phase11Data && (phase11Arguments.length !== 1 || !flags.has("--phase11-data") || options.internalRun || options.namespace !== undefined || options.webPort !== undefined || options.skipBuild)) {
    throw new Error("Phase 11 data accepts only the sealed complete invocation");
  }
  if (canonicalIntegration) {
    const expected = ["--canonical-integration", "--interruption-check", "--parallel-check"];
    if (argumentsList.length !== expected.length || expected.some((argument) => !flags.has(argument)) || options.internalRun
      || options.namespace !== undefined || options.webPort !== undefined || options.skipBuild) {
      throw new Error("canonical integration accepts only the sealed complete invocation");
    }
  }
  if (lifecycleOnly) {
    const allowed = new Set(["--internal-run", "--lifecycle-only", "--skip-build", "--interrupt-after-ready"]);
    if (!options.internalRun || !options.skipBuild || !options.namespace || !options.webPort
      || argumentsList.some((argument) => !allowed.has(argument) && !argument.startsWith("--namespace=") && !argument.startsWith("--web-port="))) {
      throw new Error("lifecycle authority is internal and generated only");
    }
  } else if (options.interruptAfterReady) throw new Error("interrupt-after-ready is lifecycle-only");

  await command("docker", ["info"]);
  await command("docker-compose", ["version"]);
  const boundaryIssues = await auditRepository(root);
  if (boundaryIssues.length) throw new Error(boundaryIssues.map((finding) => `${finding.code}: ${finding.path}`).join("\n"));
  let authority;
  let mainError;
  try {
    if (options.phase5Full) {
      options.implementationRevision = await committedImplementationHead();
      authority = await acquirePhase5ReceiptWriterLock();
    }
    const receipt = await runSingle(options);
    if (options.canonicalIntegration) {
      const probes = [await runLifecycleInterruptionProbe(), await runLifecycleParallelProbe()];
      emitCanonicalIntegrationCleanupAcknowledgement();
      const result = createGeneratedIntegrationResult({ suites: receipt.suites, cleanup: receipt.cleanup, probes });
      process.stdout.write(`${GENERATED_INTEGRATION_RESULT_PREFIX}${JSON.stringify(result)}\n`);
      process.stdout.write("[local-verify] LOCAL CANONICAL INTEGRATION PASS; RELEASE BLOCKED\n");
    }
    else if (options.parallelCheck) await parallelCheck(options);
    if (options.phase5Full) {
      if (!receipt) throw new Error("Phase 5 full gate did not produce terminal receipt input");
      const revision = await committedImplementationHead({ writerAuthority: authority });
      if (revision !== receipt.implementationRevision || revision !== options.implementationRevision) throw new Error("Phase 5 receipt revision changed after gate execution");
      await writePhase5ReceiptAtomic(receipt, {
        cleanWorktree: true, expectedRevision: revision, authority, expectedPredecessor: authority.expectedPredecessor,
      });
    }
  } catch (error) {
    mainError = error;
  } finally {
    try {
      if (authority) await releasePhase5ReceiptWriterLock(authority);
      if (options.phase6Data) {
        for (const namespace of allocatedGeneratedNamespaces) {
          if (!confirmedGeneratedNamespaces.has(namespace)) await confirmGeneratedProjectAbsent(namespace, { allowDuringShutdown: true });
        }
        emitPhase6CleanupAcknowledgement();
      }
      if (options.lifecycleOnly) {
        for (const namespace of allocatedGeneratedNamespaces) {
          if (!confirmedGeneratedNamespaces.has(namespace)) await confirmGeneratedProjectAbsent(namespace, { allowDuringShutdown: true });
          emitLifecycleCleanupAcknowledgement(namespace);
        }
      }
      if (options.canonicalIntegration && mainError) {
        await convergeAllocatedGeneratedAuthorities();
      }
    } catch (cleanupError) {
      mainError = mainError ? new AggregateError([mainError, cleanupError], "verification execution and generated cleanup acknowledgement failed") : cleanupError;
    }
  }
  if (mainError) throw mainError;
  process.stdout.write("[local-verify] all requested checks passed\n");
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const controller = new AbortController();
  shutdownSignal = controller.signal;
  const shutdown = installCooperativeShutdown((signal) => {
    controller.abort(new Error(`local verification received ${signal}`));
  });
  main().catch((error) => {
    console.error(redactText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }).finally(async () => {
    await shutdown.wait();
    shutdown.dispose();
  });
}
