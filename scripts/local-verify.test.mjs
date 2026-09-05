import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditFiles, auditMilestoneReceipt } from "./check-boundaries.mjs";
import { verifyPhase5Receipt } from "./phase5-receipt.mjs";
import {
  assertSemanticTap,
  assertPlaywrightJourney,
  canonicalIntegrationSelection,
  createGeneratedIntegrationResult,
  generatedPrivateNetwork,
  createLifecycleProbeResult,
  createPhase6DataResult,
  createPhase12DataResult,
  createPhase11DataResult,
  createPhase5ResultRecorder,
  parseBoundaryResult,
  parsePlaywrightResult,
  parseSemanticTapResult,
  PHASE6_DATA_RESULT_FORMAT,
  PHASE12_DATA_RESULT_FORMAT,
  cleanupGeneratedMediaRoot,
  cleanupGeneratedMainBrowserRoot,
  createMainBrowserEnvironment,
  migratedMainBrowserSelection,
  phase3Selection,
  phase4Selection,
  phase5Selection,
  phase5MediaSelection,
  phase6Selection,
  phase11Selection,
  phase12Selection,
  redactText,
  semanticTestCommand,
  runGeneratedMainBrowserFixture,
  validateDatabaseName,
  validateLoopbackHttpOrigin,
  validateMediaVolume,
  validateNamespace,
  validateTopologyPolicy,
} from "./local-verify.mjs";
import { INTEGRATION_TEST_FILES, PACKAGE_TEST_INVENTORY } from "./test-inventory.mjs";
import { assertPlaywrightResult, createPhase7BrowserResult, phase7BrowserSelection, PHASE7_BROWSER_RESULT_FORMAT } from "./phase7-browser-verify.mjs";

const migratedMainBrowserSpecs = [
  "apps/web/e2e/article-lifecycle.spec.ts",
  "apps/web/e2e/auth-session.spec.ts",
  "apps/web/e2e/draft-preview.spec.ts",
  "apps/web/e2e/public-list.spec.ts",
  "apps/web/e2e/public-reading.spec.ts",
  "apps/web/e2e/walking-skeleton.spec.ts",
];

const canonicalGeneratedPaths = PACKAGE_TEST_INVENTORY
  .filter((entry) => entry.scope === "integration" && entry.fixtureOwner !== "phase7-browser")
  .map((entry) => entry.path)
  .sort();

function phase11RuntimeAuthority() {
  const canonical = { version: 1, nextSha256: "a".repeat(64), serverSha256: "b".repeat(64) };
  return { ...canonical, sha256: createHash("sha256").update(JSON.stringify(canonical)).digest("hex") };
}

test("canonical integration selection owns exact non-Phase-7 inventory once by fixture owner", () => {
  const selection = canonicalIntegrationSelection();
  assert.deepEqual(selection.paths, canonicalGeneratedPaths);
  assert.equal(selection.paths.length, 31);
  assert.equal(new Set(selection.paths).size, selection.paths.length);
  assert.deepEqual(Object.fromEntries(Object.entries(selection.groups).map(([owner, paths]) => [owner, paths.length])), {
    database: 12,
    "backup-restore": 1,
    media: 1,
    "main-browser": 15,
    "error-browser": 1,
    "restore-browser": 1,
  });
  assert.equal(selection.paths.filter((path) => path.startsWith("apps/api/")).length, 14);
  assert.equal(selection.paths.filter((path) => path.startsWith("apps/web/e2e/")).length, 17);
  assert.equal(selection.paths.includes("apps/web/e2e/public-discovery.spec.ts"), false);
  assert.match(selection.manifestSha256, /^[a-f0-9]{64}$/);
});

test("Phase 12 data selection seals analytics contracts, generated database/browser authority, and current runtime digest", async () => {
  const selection = phase12Selection("data");
  assert.deepEqual(selection.databaseSuites, [["ADMIN_ANALYTICS_TEST_DATABASE_URL", "apps/api/test/admin-analytics.test.ts"]]);
  assert.deepEqual(selection.nodeSuites, [
    "packages/contracts/src/analytics.test.ts",
    "apps/web/app/lib/admin-analytics.test.ts",
    "scripts/local-verify.test.mjs",
  ]);
  assert.deepEqual(selection.browserSuites, ["apps/web/e2e/admin-analytics.spec.ts"]);
  assert.equal(selection.boundarySuite, "scripts/check-boundaries.mjs");
  const suites = [
    ...selection.databaseSuites.map(([, id]) => ({ id, kind: "database", counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } })),
    ...selection.nodeSuites.map((id) => ({ id, kind: "node", counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } })),
    ...selection.browserSuites.map((id) => ({ id, kind: "browser", counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } })),
    { id: selection.boundarySuite, kind: "boundary", counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } },
  ];
  const record = createPhase12DataResult(suites, phase11RuntimeAuthority());
  assert.equal(record.format, PHASE12_DATA_RESULT_FORMAT);
  assert.equal(record.releaseState, "BLOCKED");
  assert.equal(record.version, 1);
  assert.throws(() => phase12Selection("other"), /Phase 12 selection/i);
  assert.throws(() => createPhase12DataResult(suites.slice(1), phase11RuntimeAuthority()), /exact|missing/i);
  assert.throws(() => createPhase12DataResult(suites.map((suite) => suite.id === selection.browserSuites[0] ? { ...suite, kind: "database" } : suite), phase11RuntimeAuthority()), /exact/i);
  assert.throws(() => createPhase12DataResult(suites), /authority|missing/i);

  const source = await readFile(new URL("./local-verify.mjs", import.meta.url), "utf8");
  assert.match(source, /phase12Data && !options\.skipBuild[\s\S]*typecheck workspace for Phase 12 data[\s\S]*build workspace for Phase 12 data[\s\S]*createCanonicalRuntimeAuthority/);
  assert.match(source, /async function runPhase12DataChecks[\s\S]*phase12Selection\("data"\)[\s\S]*runGeneratedMainBrowserFixtureSelection[\s\S]*PHASE12_DATA_RESULT_PREFIX/);
  assert.match(source, /const \[commandName, \.\.\.args\] = semanticTestCommand\(file\);[\s\S]*runStep\(context, `run \$\{file\}`, commandName, args/);
  assert.match(source, /Phase 12 data accepts only the sealed complete invocation/);
  for (const args of [["--phase12-data=extra"], ["--phase12-data", "--"]]) {
    const rejected = spawnSync(process.execPath, ["scripts/local-verify.mjs", ...args], { cwd: process.cwd(), encoding: "utf8" });
    assert.notEqual(rejected.status, 0, args.join(" "));
    assert.match(`${rejected.stdout}${rejected.stderr}`, /Phase 12 data accepts only the sealed complete invocation/);
  }
});

test("Phase 11 data selection seals retention, export, privacy, restore, browser beacon, and current runtime authority", async () => {
  const selection = phase11Selection("data");
  assert.deepEqual(selection.databaseSuites, [
    ["PUBLIC_VISIBILITY_TEST_DATABASE_URL", "apps/api/test/public-visibility.test.ts"],
    ["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"],
  ]);
  assert.equal(selection.restoreSuite, "apps/api/test/backup-restore.test.ts");
  assert.deepEqual(selection.browserSuites, ["apps/web/e2e/public-reading.spec.ts"]);
  assert.deepEqual(PACKAGE_TEST_INVENTORY.find((entry) => entry.path === selection.browserSuites[0]), {
    path: "apps/web/e2e/public-reading.spec.ts", kind: "web-e2e", scope: "integration", fixtureOwner: "main-browser",
  });
  assert.deepEqual(selection.nodeSuites, ["scripts/local-verify.test.mjs"]);
  const suites = [
    ...selection.databaseSuites.map(([, id]) => ({ id, kind: "database", counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } })),
    { id: selection.restoreSuite, kind: "backup-restore", counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } },
    ...selection.browserSuites.map((id) => ({ id, kind: "browser", counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } })),
    ...selection.nodeSuites.map((id) => ({ id, kind: "node", counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } })),
  ];
  const authority = phase11RuntimeAuthority();
  const record = createPhase11DataResult(suites, authority);
  assert.equal(record.releaseState, "BLOCKED");
  assert.equal(record.version, 2);
  assert.deepEqual(record.webRuntimeAuthority, authority);
  assert.throws(() => phase11Selection("other"), /Phase 11 selection/i);
  assert.throws(() => createPhase11DataResult(suites.slice(1), authority), /exact|missing/i);
  assert.throws(() => createPhase11DataResult(suites.filter((suite) => suite.id !== selection.browserSuites[0]), authority), /exact|missing/i);
  assert.throws(() => createPhase11DataResult(suites.map((suite) => suite.id === selection.browserSuites[0] ? { ...suite, kind: "main-browser" } : suite), authority), /exact/i);
  assert.throws(() => createPhase11DataResult(suites), /authority|missing/i);
  assert.throws(() => createPhase11DataResult(suites, { ...authority, extra: true }), /authority|invalid/i);
  assert.throws(() => createPhase11DataResult(suites, { ...authority, sha256: "c".repeat(64) }), /digest|invalid/i);
  const source = await readFile(new URL("./local-verify.mjs", import.meta.url), "utf8");
  const phase11Setup = source.slice(source.indexOf("else if (options.phase11Data && !options.skipBuild)"), source.indexOf("else if (options.canonicalIntegration && !options.skipBuild)"));
  assert.match(phase11Setup, /build workspace for Phase 11 data[\s\S]*INTERNAL_API_ORIGIN[\s\S]*createCanonicalRuntimeAuthority/);
  assert.match(source, /hashRuntimeArtifact[\s\S]*symbolic link[\s\S]*readdir[\s\S]*localeCompare/);
  assert.match(source, /NODE_ENV: production[\s\S]*ports: !override[\s\S]*\.next:ro[\s\S]*server\.mjs:ro/);
  const phase11Runner = source.slice(source.indexOf("async function runPhase11DataChecks"), source.indexOf("const canonicalDatabaseEnvironment"));
  assert.doesNotMatch(phase11Runner, /build workspace|typecheck workspace/);
});

test("generated canonical Web verifier keeps private static trust while publishing only a loopback edge with bounded redacted diagnostics", async () => {
  const source = await readFile(new URL("./local-verify.mjs", import.meta.url), "utf8");
  const authority = source.slice(source.indexOf("async function createCanonicalRuntimeAuthority"), source.indexOf("async function hashRuntimeArtifact"));
  const apiOverride = authority.slice(authority.indexOf('"  api:"'), authority.indexOf("...(includeWeb ? ["));
  assert.match(authority, /ports: !override[\s\S]*127\.0\.0\.1:\$\{context\.runtimeWebPort \?\? context\.webPort\}:3100/);
  assert.match(source, /if \(options\.lifecycleOnly \|\| options\.phase11Data \|\| options\.phase12Data \|\| options\.canonicalIntegration\) await inspectGeneratedWebVerifierEdge\(context\)/);
  assert.match(source, /options\.lifecycleOnly[\s\S]*createCanonicalRuntimeAuthority\(context, \{ includeWeb: false, publishWeb: true \}\)/);
  assert.match(authority, /TRUSTED_PROXY_CIDRS: \$\{privateNetwork\.web\}\/32[\s\S]*postgres:[\s\S]*ipv4_address: \$\{privateNetwork\.postgres\}[\s\S]*private:[\s\S]*ipv4_address: \$\{privateNetwork\.web\}[\s\S]*subnet: \$\{privateNetwork\.subnet\}[\s\S]*verifier-edge:[\s\S]*internal: false[\s\S]*subnet: \$\{privateNetwork\.edgeSubnet\}/);
  assert.doesNotMatch(apiOverride, /verifier-edge/);
  assert.match(source, /async function inspectGeneratedWebVerifierEdge[\s\S]*\{\{\.Name\}\} \{\{\.State\}\} \{\{\.Ports\}\}[\s\S]*127\.0\.0\.1:\$\{port\}/);
  assert.match(source, /async function generatedWebVerifierFailureDiagnostics[\s\S]*composeArgs\(context, "ps"\)[\s\S]*logs", "--no-color", "--tail", "200", "api", "web"[\s\S]*redactText/);
  assert.match(source, /canonicalIntegration \|\| options\.phase11Data \|\| options\.phase12Data[\s\S]*generatedWebVerifierFailureDiagnostics/);
  assert.match(source, /primaryFailure\?\.result[\s\S]*redactText\(primaryOutput, context\.secrets\)\.slice\(-3_000\)/);
});

test("generated private networks are port-bound, disjoint, and keep exact service addresses inside their /29", () => {
  const ports = [1, 1_024, 49_152, 57_312, 65_535];
  const networks = ports.map(generatedPrivateNetwork);
  assert.equal(new Set(networks.map((network) => network.subnet)).size, ports.length);
  assert.equal(new Set(networks.map((network) => network.edgeSubnet)).size, ports.length);
  for (const network of networks) {
    const match = /^(172\.\d+\.\d+)\.(\d+)\/29$/.exec(network.subnet);
    assert.ok(match);
    const base = Number(match[2]);
    assert.deepEqual([network.api, network.web, network.postgres], [2, 3, 4].map((offset) => `${match[1]}.${base + offset}`));
    assert.equal(network.edgeSubnet, network.subnet.replace(/^172\./, "10."));
  }
  for (const invalid of [0, 65_536, 1.5, Number.NaN]) assert.throws(() => generatedPrivateNetwork(invalid), /valid Web port/);
});

test("generated integration result binds exact paths actual counts cleanup and digest", () => {
  const selection = canonicalIntegrationSelection();
  const suites = selection.paths.map((path) => ({
    path,
    fixtureOwner: PACKAGE_TEST_INVENTORY.find((entry) => entry.path === path).fixtureOwner,
    counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
  }));
  const cleanup = { namespace: "blogxverify_a1b2c3d4", containersAbsent: true, volumesAbsent: true, pathsAbsent: true };
  const probes = [
    createLifecycleProbeResult({ kind: "interruption", namespaces: ["blogxverify_b1c2d3e4"], interrupted: true }),
    createLifecycleProbeResult({ kind: "parallel", namespaces: ["blogxverify_c1d2e3f4", "blogxverify_d1e2f3a4"], interrupted: false }),
  ];
  const result = createGeneratedIntegrationResult({ suites, cleanup, probes });
  assert.equal(result.format, "blog-x-generated-integration-result");
  assert.equal(result.version, 1);
  assert.equal(result.releaseState, "BLOCKED");
  assert.deepEqual(result.inventory, selection.paths);
  assert.deepEqual(result.counts, { tests: 31, passed: 31, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.deepEqual(result.cleanup, cleanup);
  assert.equal(result.manifestSha256, selection.manifestSha256);
  assert.match(result.resultSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => createGeneratedIntegrationResult({ suites: suites.slice(1), cleanup, probes }), /missing|inventory|exact/i);
  assert.throws(() => createGeneratedIntegrationResult({ suites: [...suites, suites[0]], cleanup, probes }), /duplicate|inventory|exact/i);
  assert.throws(() => createGeneratedIntegrationResult({ suites: suites.map((suite, index) => index ? suite : { ...suite, counts: { ...suite.counts, skipped: 1, passed: 0 } }), cleanup, probes }), /pass-only|counts/i);
  const probe = createLifecycleProbeResult({ kind: "interruption", namespaces: ["blogxverify_b1c2d3e4"], interrupted: true });
  assert.throws(() => createGeneratedIntegrationResult({ suites, cleanup, probes: [{ ...probe, version: 2 }, probes[1]] }), /probe|invalid/i);
  assert.throws(() => createGeneratedIntegrationResult({ suites, cleanup, probes: [] }), /exact|probe|pair/i);
  assert.throws(() => createGeneratedIntegrationResult({ suites, cleanup, probes: [probes[1], probes[0]] }), /exact|probe|pair/i);
});

test("lifecycle probes attest zero manifest paths and cannot inflate package counts", async () => {
  const record = createLifecycleProbeResult({
    kind: "parallel",
    namespaces: ["blogxverify_a1b2c3d4", "blogxverify_b1c2d3e4"],
    interrupted: false,
  });
  assert.deepEqual(record.inventory, []);
  assert.deepEqual(record.counts, { tests: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.equal(record.cleanupAcknowledged, true);
  assert.equal(record.releaseState, "BLOCKED");
  assert.throws(() => createLifecycleProbeResult({ kind: "parallel", namespaces: ["blogxlocal"], interrupted: false }), /namespace/i);

  const source = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  const lifecycle = source.slice(source.indexOf("async function runLifecycleInterruptionProbe"), source.indexOf("function emitCanonicalIntegrationCleanupAcknowledgement"));
  for (const path of INTEGRATION_TEST_FILES) assert.equal(lifecycle.includes(path), false, path);
  assert.doesNotMatch(lifecycle, /semanticTestCommand|playwright|runDatabaseSuite|runGeneratedMainBrowserFixture|--canonical-integration/i);
  assert.match(source, /const interruption = options\.interruptAfterReady[\s\S]*addEventListener\("abort"[\s\S]*LIFECYCLE READY[\s\S]*await interruption/);
  assert.match(source, /const keepAlive = setInterval[\s\S]*clearInterval\(keepAlive\)[\s\S]*LIFECYCLE READY/);
  assert.match(source, /async function runLifecycleChildWithRecovery[\s\S]*Promise\.allSettled[\s\S]*convergeGeneratedProjectCleanup/);
  assert.match(lifecycle, /Promise\.allSettled\([\s\S]*runLifecycleChildWithRecovery[\s\S]*failures\.length/);
  assert.match(source, /async function convergeGeneratedProjectCleanup[\s\S]*attempt < 2[\s\S]*down[\s\S]*confirmGeneratedProjectAbsent/);
  assert.match(source, /canonicalIntegration && mainError[\s\S]*convergeAllocatedGeneratedAuthorities/);
  assert.match(source, /cleanupCanonicalRuntimeAuthority[\s\S]*context\.composeOverride = undefined[\s\S]*context\.canonicalRuntimeRoot = undefined/);
});

test("legacy Web E2E specs require runner facts and own no infrastructure", async () => {
  for (const path of migratedMainBrowserSpecs) {
    const source = await readFile(join(process.cwd(), path), "utf8");
    assert.match(source, /E2E_WEB_ORIGIN/, `${path} requires the runner origin`);
    assert.match(source, /E2E_RUN_ID/, `${path} requires a run-scoped identity`);
    assert.doesNotMatch(source, /node:child_process|\bspawn\s*\(|\bChildProcess\b/, `${path} cannot spawn children`);
    assert.doesNotMatch(source, /DATABASE_URL|session-fixture|127\.0\.0\.1:3100|127\.0\.0\.1:3001/, `${path} cannot claim fixed or database authority`);
    assert.doesNotMatch(source, /test\.beforeAll|test\.afterAll|test\.skip|\.kill\s*\(/, `${path} cannot own lifecycle or skip missing facts`);
    assert.doesNotMatch(source, /E2E_(?:WEB_ORIGIN|RUN_ID)\s*\?\?/, `${path} cannot fall back from runner facts`);
  }
});

test("generated main-browser selection owns each migrated spec exactly once", () => {
  const selection = migratedMainBrowserSelection();
  assert.deepEqual(selection, migratedMainBrowserSpecs);
  assert.equal(new Set(selection).size, migratedMainBrowserSpecs.length);
});

test("main-browser environment exposes only generated facts and rejects canonical authority", () => {
  const context = {
    namespace: "blogxverify_a1b2c3d4",
    database: "blog_x_a1b2c3d4",
    mediaVolume: "blogxverify_a1b2c3d4_media-data",
    webOrigin: "http://127.0.0.1:43123",
    runId: "main-browser-a1b2c3d4",
    username: "admin-main-browser-a1b2c3d4",
    password: "generated-password",
  };
  const environment = createMainBrowserEnvironment(context, {
    E2E_EXPIRED_SESSION_TOKEN: "expired-token",
    E2E_REVOKED_SESSION_TOKEN: "revoked-token",
  }, {
    PATH: process.env.PATH ?? "",
    DATABASE_URL: "must-not-leak",
    E2E_WEB_ORIGIN: "must-not-override",
    BLOG_X_PUBLIC_ORIGIN: "must-not-leak",
    ADMIN_PASSWORD: "must-not-leak",
  });
  assert.equal(environment.E2E_WEB_ORIGIN, context.webOrigin);
  assert.equal(environment.E2E_RUN_ID, context.runId);
  assert.equal(environment.E2E_ADMIN_USERNAME, context.username);
  assert.equal(environment.E2E_ADMIN_PASSWORD, context.password);
  assert.equal(environment.E2E_EXPIRED_SESSION_TOKEN, "expired-token");
  assert.equal(environment.E2E_REVOKED_SESSION_TOKEN, "revoked-token");
  assert.equal(environment.PATH, process.env.PATH ?? "");
  for (const name of ["DATABASE_URL", "BLOG_X_PUBLIC_ORIGIN", "ADMIN_PASSWORD"]) assert.equal(name in environment, false, name);
  assert.throws(() => createMainBrowserEnvironment({ ...context, webOrigin: "http://127.0.0.1:3100" }, {}, {}), /canonical|3100/i);
  assert.throws(() => createMainBrowserEnvironment({ ...context, namespace: "blogxlocal" }, {}, {}), /namespace/i);
  assert.throws(() => createMainBrowserEnvironment(context, { E2E_UNKNOWN_FACT: "no" }, {}), /fact/i);
});

test("generated main-browser fixture schedules exact specs and cleans its paths once on success and failure", async () => {
  const context = {
    namespace: "blogxverify_b1c2d3e4",
    database: "blog_x_b1c2d3e4",
    mediaVolume: "blogxverify_b1c2d3e4_media-data",
    webOrigin: "http://127.0.0.1:43124",
    runId: "main-browser-b1c2d3e4",
    username: "admin-main-browser-b1c2d3e4",
    password: "generated-password",
    secrets: ["generated-password"],
  };
  const roots = [];
  const executed = [];
  const usernames = [];
  const webResets = [];
  const succeeded = await runGeneratedMainBrowserFixture(context, {
    seedScenario: async (scenarioContext, path, paths) => {
      roots.push(paths.root);
      usernames.push(scenarioContext.username);
      return path.endsWith("auth-session.spec.ts")
        ? { E2E_EXPIRED_SESSION_TOKEN: "expired-token", E2E_REVOKED_SESSION_TOKEN: "revoked-token" }
        : {};
    },
    resetWeb: async (_scenarioContext, path) => { webResets.push(path); },
    runSpec: async (_context, path, environment) => {
      executed.push(path);
      assert.equal(environment.E2E_WEB_ORIGIN, context.webOrigin);
      return { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
    },
  });
  assert.deepEqual(executed, migratedMainBrowserSpecs);
  assert.equal(new Set(executed).size, migratedMainBrowserSpecs.length);
  assert.equal(new Set(usernames).size, migratedMainBrowserSpecs.length);
  assert.equal(usernames.every((username) => username.startsWith(`${context.username}-`)), true);
  assert.deepEqual(webResets, migratedMainBrowserSpecs);
  assert.equal(new Set(roots).size, 1);
  await assert.rejects(stat(roots[0]), /ENOENT/);
  assert.deepEqual(succeeded.counts, { tests: 6, passed: 6, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.equal(succeeded.cleanup.pathsAbsent, true);

  let failureRoot;
  let cleanupCalls = 0;
  await assert.rejects(runGeneratedMainBrowserFixture(context, {
    seedScenario: async (_context, _path, paths) => { failureRoot = paths.root; return {}; },
    resetWeb: async () => undefined,
    runSpec: async () => { throw new Error("injected browser failure"); },
    cleanupRoot: async (path) => { cleanupCalls += 1; await cleanupGeneratedMainBrowserRoot(path); },
  }), /injected browser failure/);
  assert.equal(cleanupCalls, 1);
  assert.notEqual(failureRoot, roots[0]);
  await assert.rejects(stat(failureRoot), /ENOENT/);

  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  const lifecycle = runner.slice(runner.indexOf("async function runSingle"), runner.indexOf("async function parallelCheck"));
  assert.match(lifecycle, /finally[\s\S]*convergeGeneratedProjectCleanup/);
  assert.match(runner, /async function convergeGeneratedProjectCleanup[\s\S]*docker-compose[\s\S]*down[\s\S]*confirmGeneratedProjectAbsent/);
  assert.doesNotMatch(lifecycle, /blogxlocal|127\.0\.0\.1:3100/);
});

test("verification namespaces are narrow and safe cleanup targets", () => {
  assert.equal(validateNamespace("blogxverify_a1b2c3d4"), "blogxverify_a1b2c3d4");
  for (const candidate of ["", "/", ".", "blogxverify", "blogxverify_A1B2C3D4", "blogxverify_a;rm", "other_a1b2c3d4"]) {
    assert.throws(() => validateNamespace(candidate), /namespace/i);
  }
});

test("Phase 3 selections deterministically route only their named semantic suites", () => {
  assert.deepEqual(phase3Selection("api"), {
    databaseSuites: [["PHASE3_TEST_DATABASE_URL", "apps/api/test/public-distribution.test.ts"]],
    webSuites: [],
  });
  assert.deepEqual(phase3Selection("metadata"), {
    databaseSuites: [],
    webSuites: ["apps/web/app/lib/site-metadata.test.ts", "apps/web/e2e/phase3-distribution.spec.ts"],
  });
  assert.deepEqual(phase3Selection("full"), {
    databaseSuites: [
      ["PHASE3_TEST_DATABASE_URL", "apps/api/test/public-distribution.test.ts"],
      ["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"],
    ],
    webSuites: ["apps/web/app/lib/site-metadata.test.ts", "apps/web/e2e/phase3-distribution.spec.ts"],
  });
  assert.deepEqual(phase3Selection("export-api"), {
    databaseSuites: [["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"]],
    webSuites: [],
  });
  assert.deepEqual(phase3Selection("export-browser"), {
    databaseSuites: [],
    webSuites: ["apps/web/e2e/phase3-distribution.spec.ts"],
  });
  assert.throws(() => phase3Selection("unknown"), /Phase 3 selection/i);
});

test("Phase 4 security selection names every local API security suite", () => {
  const selection = phase4Selection("security");
  assert.ok(selection.databaseSuites.length >= 11);
  assert.deepEqual(selection.apiSuites, [
    "apps/api/test/security-hardening.test.ts",
    "apps/api/test/markdown-renderer.test.ts",
  ]);
  assert.throws(() => phase4Selection("unknown"), /Phase 4 selection/i);
});

test("Phase 4 operations and restore selections are explicit", () => {
  assert.deepEqual(phase4Selection("operations"), {
    nodeSuites: ["scripts/ops-status.test.mjs", "scripts/backup/backup.test.mjs", "scripts/local-verify.test.mjs"],
  });
  assert.deepEqual(phase4Selection("restore"), {
    nodeSuites: ["scripts/backup/restore.test.mjs", "scripts/local-verify.test.mjs"],
    databaseSuite: "apps/api/test/backup-restore.test.ts",
    browserSuite: "apps/web/e2e/phase4-restore.spec.ts",
  });
});

test("Phase 5 media selection keeps legacy restore evidence compatible with the current migration authority", async () => {
  assert.deepEqual(phase5MediaSelection(), {
    databaseSuites: [
      ["ARTICLE_TEST_DATABASE_URL", "apps/api/test/article-draft-preview.test.ts"],
      ["LIFECYCLE_TEST_DATABASE_URL", "apps/api/test/article-lifecycle.test.ts"],
      ["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"],
    ],
    apiSuites: ["apps/api/test/markdown-renderer.test.ts"],
    nodeSuites: ["scripts/prohibitions/media-policy.test.mjs", "scripts/local-verify.test.mjs"],
    databaseSuite: "apps/api/test/backup-restore.test.ts",
    browserSuites: ["apps/web/e2e/phase1-publishing.spec.ts", "apps/web/e2e/phase4-restore.spec.ts"],
  });
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  assert.match(runner, /values\[1\] !== 10/);
  assert.doesNotMatch(runner, /values\[1\] !== 6/);
  assert.match(runner, /--phase5-media/);
  assert.match(runner, /PHASE5_LEGACY_ARTICLE_ID/);
  assert.match(runner, /phase1-publishing\.spec\.ts/);
  const restoreFixture = runner.slice(runner.indexOf("async function seedRestoreFixture"), runner.indexOf("async function runPhase4RestoreChecks"));
  assert.match(restoreFixture, /await resetGeneratedAcceptanceMedia\(context\)/);
});

test("Phase 5 full selection is an exact once-only Phase 1-5 superset with a terminal receipt boundary", async () => {
  const selection = phase5Selection("full");
  assert.ok(selection.databaseSuites.length >= phase4Selection("full").databaseSuites.length);
  for (const file of [
    "scripts/backup/production.test.mjs",
    "scripts/phase5-receipt.test.mjs",
    "scripts/phase5-receipt-prohibitions.test.mjs",
    "scripts/phase5-receipt-concurrency.test.mjs",
    "scripts/release-gate.test.mjs",
    "scripts/prohibitions/media-policy.test.mjs",
  ]) assert.ok(selection.nodeSuites.includes(file), file);
  for (const file of ["apps/web/e2e/phase1-publishing.spec.ts", "apps/web/e2e/phase2-reading.spec.ts", "apps/web/e2e/phase3-distribution.spec.ts", "apps/web/e2e/phase4-restore.spec.ts"]) {
    assert.ok(selection.browserSuites.includes(file), file);
  }
  const all = [...selection.databaseSuites.map((item) => item[1]), ...selection.apiSuites, ...selection.nodeSuites, ...selection.browserSuites, selection.databaseSuite];
  assert.equal(new Set(all).size, all.length, "every selected suite is registered exactly once");
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  assert.match(runner, /function phase5Selection/);
  assert.match(runner, /--phase5-full/);
  assert.match(runner, /blogxprodverify_/);
  assert.match(runner, /generated-production-pipeline/);
  const full = runner.slice(runner.indexOf("async function runPhase5FullChecks"), runner.indexOf("async function runSingle"));
  assert.match(full, /createPhase5SuiteManifest/);
  assert.match(full, /runPhase4ReleaseChecks/);
  assert.match(full, /runPhase5GeneratedPipeline/);
  assert.match(full, /Promise\.all\(\[0, 1\]\.map/);
  assert.match(full, /createPhase5ResultRecorder/);
  assert.match(full, /production-backup-result-v1/);
  assert.match(runner, /await writePhase5ReceiptAtomic/);
  assert.match(runner, /await runSingle\(options\);[\s\S]*await parallelCheck\(options\);[\s\S]*await writePhase5ReceiptAtomic/);
  assert.match(runner, /committedImplementationHead\(\{ writerAuthority: authority \}\)/);
  assert.ok(full.indexOf("runPhase4ReleaseChecks") < runner.indexOf("await writePhase5ReceiptAtomic"));
  assert.match(runner, /cleanupPhase5ProductionAuthorities/);
  assert.match(runner, /restoreVerifierOwnedNextEnvironment/);
  assert.match(runner, /options\.phase5Full && !options\.skipBuild\) \{\s*await preflightOfflinePrerequisites/s);
  assert.match(runner, /!options\.skipBuild && !options\.phase5Full/);
});

test("Phase 6 data selection is exact, once-only, and separate from Phase 5 receipt authority", async () => {
  const selection = phase6Selection("data");
  assert.deepEqual(selection, {
    databaseSuites: [
      ["PUBLIC_DISCOVERY_TEST_DATABASE_URL", "apps/api/test/public-discovery.test.ts"],
      ["PUBLIC_LIST_TEST_DATABASE_URL", "apps/api/test/public-list.test.ts"],
      ["PUBLIC_VISIBILITY_TEST_DATABASE_URL", "apps/api/test/public-visibility.test.ts"],
      ["AUTH_TEST_DATABASE_URL", "apps/api/test/taxonomy.test.ts"],
      ["PHASE2_TEST_DATABASE_URL", "apps/api/test/phase2-public-visibility.test.ts"],
    ],
    nodeSuites: ["scripts/local-verify.test.mjs"],
    boundarySuite: "scripts/check-boundaries.mjs",
  });
  const paths = [...selection.databaseSuites.map((item) => item[1]), ...selection.nodeSuites, selection.boundarySuite];
  assert.equal(new Set(paths).size, paths.length);
  assert.throws(() => phase6Selection("unknown"), /Phase 6 selection/i);

  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  const phase6 = runner.slice(runner.indexOf("async function runPhase6DataChecks"), runner.indexOf("async function runPhase5MediaChecks"));
  assert.match(runner, /--phase6-data/);
  assert.match(runner, /--internal-run", "--phase6-data", "--skip-build/);
  assert.match(runner, /LOCAL PHASE 6 DATA PASS; RELEASE BLOCKED/);
  assert.match(phase6, /runDatabaseSuite/);
  assert.match(phase6, /if \(!context\.internalRun\)[\s\S]*typecheck workspace[\s\S]*build workspace/);
  assert.match(phase6, /resetAcceptanceData/);
  assert.match(phase6, /assertSemanticTap/);
  assert.match(phase6, /check:boundaries/);
  assert.match(phase6, /--expect-blocked/);
  assert.match(runner, /options\.phase6Data && !options\.skipBuild\) \{\s*await preflightOfflinePrerequisites/s);
  assert.match(runner, /context\.phase6Data[\s\S]*\/workspace\/apps\/api:ro[\s\S]*\/workspace\/packages\/contracts:ro/);
  for (const receiptCapability of [
    "acquirePhase5ReceiptWriterLock",
    "createPhase5SuiteManifest",
    "createPhase5ResultRecorder",
    "writePhase5ReceiptAtomic",
  ]) assert.doesNotMatch(phase6, new RegExp(receiptCapability));

  const phase5 = phase5Selection("full");
  assert.equal(phase5.databaseSuites.some((item) => item[1] === "apps/api/test/public-discovery.test.ts"), false);
});

test("Phase 6 interruption and parallel paths keep exact generated authority", async () => {
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  const schema = runner.slice(runner.indexOf("async function inspectSchema"), runner.indexOf("async function runMigration"));
  assert.match(schema, /values\[1\] !== 10/);
  assert.match(schema, /articles_schedule_pair_check/);
  assert.match(schema, /articles_schedule_draft_check/);
  assert.match(schema, /articles_schedule_due_index/);
  assert.match(schema, /article_daily_views_total_matches_sources_check/);
  assert.match(schema, /article_daily_views_day_index/);
  const interruption = runner.slice(runner.indexOf("async function interruptionCheck"), runner.indexOf("async function migrationRetryPreservation"));
  assert.match(interruption, /\$\{context\.namespace\}_migration_interrupt/);
  assert.match(interruption, /migration lock acquired/);
  assert.match(interruption, /"kill", container/);
  assert.match(interruption, /"rm", "-f", container/);
  assert.match(interruption, /Promise\.all\(\[runMigration/);
  assert.match(interruption, /migrationRetryPreservation/);
  assert.match(interruption, /confirm verification volume identity/);

  const parallel = runner.slice(runner.indexOf("async function parallelCheck"), runner.indexOf("function optionValue"));
  assert.match(parallel, /firstPort === secondPort/);
  assert.match(parallel, /--internal-run", "--phase6-data", "--skip-build/);
  assert.match(parallel, /LOCAL PHASE 6 DATA PASS; RELEASE BLOCKED/);
  assert.match(parallel, /GENERATED PARALLEL CLEANUP PASS/);
  assert.match(parallel, /parallel child passed; LOCAL PHASE 6 DATA PASS; RELEASE BLOCKED/);
  assert.match(parallel, /confirmGeneratedProjectAbsent/);
  assert.match(runner, /GENERATED CLEANUP PASS/);
  assert.doesNotMatch(parallel, /phase5|receipt/i);
});

test("Phase 11 migration authority is a complete ten-entry Drizzle history", async () => {
  const drizzleRoot = join(process.cwd(), "apps/api/drizzle");
  const metadataRoot = join(drizzleRoot, "meta");
  const sqlFiles = (await readdir(drizzleRoot)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  const metadataFiles = (await readdir(metadataRoot)).sort();
  const journal = JSON.parse(await readFile(join(metadataRoot, "_journal.json"), "utf8"));
  const migration = await readFile(join(drizzleRoot, "0009_article_daily_views.sql"), "utf8");
  const schema = await readFile(join(process.cwd(), "apps/api/src/db/schema.ts"), "utf8");
  const findings = [];

  if (sqlFiles.length !== 10 || sqlFiles[0] !== "0000_phase1_walking_skeleton.sql" || sqlFiles.at(-1) !== "0009_article_daily_views.sql") {
    findings.push(`numbered SQL authority must contain exactly 0000 through 0009; found ${sqlFiles.join(", ")}`);
  }
  const journalTail = journal.entries?.at(-1);
  if (journal.entries?.length !== 10 || journalTail?.idx !== 9 || journalTail?.tag !== "0009_article_daily_views") {
    findings.push(`journal must end at idx 9 / 0009_article_daily_views; found ${JSON.stringify(journalTail)}`);
  }
  if (!metadataFiles.includes("0009_snapshot.json")) findings.push("generated metadata must include meta/0009_snapshot.json");

  const snapshot = metadataFiles.includes("0009_snapshot.json")
    ? await readFile(join(metadataRoot, "0009_snapshot.json"), "utf8")
    : "";
  for (const token of [
    "article_daily_views",
    "article_daily_views_counters_nonnegative_check",
    "article_daily_views_total_matches_sources_check",
    "article_daily_views_day_index",
  ]) {
    if (!migration.includes(token)) findings.push(`tracked migration is missing ${token}`);
    if (!schema.includes(token)) findings.push(`Drizzle schema is missing ${token}`);
    if (snapshot && !snapshot.includes(token)) findings.push(`generated snapshot is missing ${token}`);
  }
  assert.deepEqual(findings, [], "Phase 11 migration authorities must be structurally identical");
});

test("Phase 8 machine records require every exact Phase 6 suite to pass with nonzero parser counts", () => {
  const suites = [
    ...phase6Selection("data").databaseSuites.map(([, id]) => ({ id, kind: "database", counts: { tests: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0 } })),
    ...phase6Selection("data").nodeSuites.map((id) => ({ id, kind: "node", counts: { tests: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0, todo: 0 } })),
    { id: phase6Selection("data").boundarySuite, kind: "boundary", counts: { tests: 4, passed: 4, failed: 0, cancelled: 0, skipped: 0, todo: 0 } },
  ];
  const result = createPhase6DataResult(suites);
  assert.equal(PHASE6_DATA_RESULT_FORMAT, "blog-x-phase6-data-result");
  assert.equal(result.format, PHASE6_DATA_RESULT_FORMAT);
  assert.equal(result.version, 1);
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.suites.length, 7);
  assert.deepEqual(result.counts, { tests: 17, passed: 17, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.throws(() => createPhase6DataResult(suites.slice(1)), /exact|complete|missing/i);
  assert.throws(() => createPhase6DataResult([...suites, suites[0]]), /exact|duplicate/i);
  assert.throws(() => createPhase6DataResult(suites.map((suite, index) => index ? suite : { ...suite, counts: { ...suite.counts, tests: 0, passed: 0 } })), /zero|pass/i);
});

test("Phase 8 Phase 7 parser is import-safe and returns exact pass-only counts", () => {
  assert.equal(PHASE7_BROWSER_RESULT_FORMAT, "blog-x-phase7-browser-result");
  assert.deepEqual(assertPlaywrightResult("Running 3 tests using 1 worker\n  3 passed"), {
    tests: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0, todo: 0,
  });
  for (const output of [
    "Running 0 tests using 1 worker\n  0 passed",
    "Running 3 tests using 1 worker\n  2 passed\n  1 skipped",
    "Running 3 tests using 1 worker\n  2 passed\n  1 failed",
    "Running 3 tests using 1 worker\n  2 passed",
  ]) assert.throws(() => assertPlaywrightResult(output), /zero|non-pass|mismatch|incomplete/i);
  const counts = assertPlaywrightResult("Running 3 tests using 1 worker\n  3 passed");
  const result = createPhase7BrowserResult({
    inventory: phase7BrowserSelection().inventory,
    counts,
    cleanup: { childrenAbsent: true, originsAbsent: true, webRootAbsent: true },
  });
  assert.deepEqual(result.inventory, ["apps/web/e2e/public-discovery.spec.ts"]);
  assert.equal(result.version, 2);
  assert.match(result.resultSha256, /^[a-f0-9]{64}$/);
});

test("a replacement passed audit rejects body/frontmatter receipt revision disagreement", async () => {
  const audit = await readFile(join(process.cwd(), ".planning/milestones/v1.0-MILESTONE-AUDIT.md"), "utf8");
  const verified = await verifyPhase5Receipt();
  const revision = verified.receipt.implementationRevision;
  let replacement = audit
    .replace(/^audited: .*$/m, "audited: 2099-01-01T00:00:00Z")
    .replace(/^full_gate_receipt_sha256: .*$/m, `full_gate_receipt_sha256: ${verified.sha256}`)
    .replace(/^implementation_revision: .*$/m, `implementation_revision: ${revision}`)
    .replace(/implementation revision `[a-f0-9]{40}`;/, `implementation revision \`${revision}\`;`);
  if (!/^audit_body_revision_contract: 1$/m.test(replacement)) {
    replacement = replacement.replace("full_gate_receipt_version: 2", "full_gate_receipt_version: 2\naudit_body_revision_contract: 1");
  }
  assert.deepEqual(await auditMilestoneReceipt(process.cwd(), replacement, { isAncestor: async () => true }), []);
  for (const changed of [
    replacement.replace(`implementation revision \`${revision}\`;`, `implementation revision \`${"0".repeat(40)}\`;`),
    replacement.replace(`implementation revision \`${revision}\`;`, `implementation revision \`${revision}\`; implementation revision \`${revision}\`;`),
    replacement.replace(`implementation revision \`${revision}\`;`, "implementation revision malformed;"),
  ]) {
    const findings = await auditMilestoneReceipt(process.cwd(), changed, { isAncestor: async () => true });
    assert.equal(findings.some((finding) => finding.code === "phase5_audit_body_revision"), true);
  }
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  assert.doesNotMatch(runner, /testLifecycleObserver/);
});

test("Phase 4 full selection explicitly names security, operations, restore, release, database, and browser evidence", () => {
  const selection = phase4Selection("full");
  assert.ok(selection.databaseSuites.length >= 11);
  assert.ok(selection.apiSuites.includes("apps/api/test/security-hardening.test.ts"));
  for (const file of ["scripts/ops-status.test.mjs", "scripts/backup/backup.test.mjs", "scripts/backup/restore.test.mjs", "scripts/release-gate.test.mjs", "scripts/local-verify.test.mjs"]) {
    assert.ok(selection.nodeSuites.includes(file), file);
  }
  assert.deepEqual(selection.browserSuites, ["apps/web/e2e/phase2-reading.spec.ts", "apps/web/e2e/phase3-distribution.spec.ts", "apps/web/e2e/phase4-restore.spec.ts"]);
});

test("topology policy admits only a Web edge and rejects public data planes", async () => {
  const subjectPath = process.env.GSD_PROHIB_SUBJECT ?? join(process.cwd(), "ops/topology-policy.json");
  const subject = JSON.parse(await readFile(subjectPath, "utf8"));
  assert.doesNotThrow(() => validateTopologyPolicy(subject));
});

test("Phase 4 name-only configuration and topology artifacts fail closed on values or public data planes", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "blog-x-phase4-boundary-"));
  context.after(async () => { await rm(fixtureRoot, { recursive: true, force: true }); });
  await mkdir(join(fixtureRoot, "ops"), { recursive: true });
  await writeFile(join(fixtureRoot, "ops/production-config.names.json"), JSON.stringify({
    format: "blog-x-production-config-names", version: 1, valueSource: "untracked-root-or-service-owned-mechanism",
    variables: [{ name: "ADMIN_PASSWORD", class: "seed-secret", consumers: ["seed"], value: "fixture-only" }],
  }));
  await writeFile(join(fixtureRoot, "ops/topology-policy.json"), JSON.stringify({
    format: "blog-x-topology-policy", version: 1,
    browser: { relativeRoutes: ["/api", "/media"], directDataPlane: true },
    services: { web: { hostPublished: true, bind: "wildcard" }, api: { hostPublished: true }, postgres: { hostPublished: true } },
    futurePrivateLink: { required: true, status: "unresolved" },
  }));
  const issues = await auditFiles(fixtureRoot, ["ops/production-config.names.json", "ops/topology-policy.json"]);
  assert.equal(issues.some((finding) => finding.code === "invalid_production_config_contract"), true);
  assert.equal(issues.some((finding) => finding.code === "unsafe_topology_policy"), true);
});

test("Phase 4 security runner remains local, selected, and fail-closed", async () => {
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  assert.match(runner, /phase4Selection\("security"\)/);
  assert.match(runner, /--phase4-\$\{mode\}/);
  assert.match(runner, /await runPhase4SecurityChecks\(context\)/);
  assert.match(runner, /assertSemanticTap\(result\.combined\)/);
});

test("Phase 4 operations runner names effective config, restart, status, and cached-image gates", async () => {
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  assert.match(runner, /runPhase4OperationsChecks/);
  assert.match(runner, /preflightCachedImages/);
  assert.match(runner, /exerciseApiRecovery/);
  assert.match(runner, /ops-status\.mjs/);
  assert.match(runner, /config.*--format.*json/s);
  assert.match(runner, /30_000/);
});

test("Phase 4 restore runner preserves backup evidence through authority and browser comparison", async () => {
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  assert.match(runner, /runPhase4RestoreChecks/);
  assert.match(runner, /resetGeneratedAcceptanceMedia/);
  assert.match(runner, /restoreBackupSet/);
  assert.match(runner, /backup-restore\.test\.ts/);
  assert.match(runner, /phase4-restore\.spec\.ts/);
  assert.match(runner, /E2E_RESTORE_WEB_ORIGIN/);
  assert.match(runner, /cleanupGeneratedRestoreRoot/);
});

test("Phase 4 restore runner owns an origin-bound runtime and absence-confirmed teardown", async () => {
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  const restoreRunner = runner.slice(runner.indexOf("async function runPhase4RestoreChecks"), runner.indexOf("async function runPhase4ReleaseChecks"));
  const findings = [];
  if (/composeOverride:\s*context\.composeOverride/.test(restoreRunner)) findings.push("restore context reuses the parent Compose override");
  if (!/const restoreContext = \{[\s\S]*internalApiOrigin:\s*context\.internalApiOrigin/.test(restoreRunner)) findings.push("restore context does not retain the current internal API origin");
  if (!/PUBLIC_ORIGIN:\s*restoreContext\.publicOrigin/.test(restoreRunner)
    || !/INTERNAL_API_ORIGIN:\s*restoreContext\.internalApiOrigin/.test(restoreRunner)) {
    findings.push("Web is not built with the exact restore public/internal origins");
  }
  const buildIndex = restoreRunner.search(/PUBLIC_ORIGIN:\s*restoreContext\.publicOrigin/);
  const authorityIndex = restoreRunner.search(/createCanonicalRuntimeAuthority\(restoreContext\)/);
  const restoreIndex = restoreRunner.search(/restoreBackupSet\(/);
  if (buildIndex < 0 || authorityIndex <= buildIndex || restoreIndex <= authorityIndex) findings.push("restore runtime authority is not created after its origin-specific Web build and before restore");
  if (!/validateRestoreNamespace|validateRestoreDatabase|validateRestoreMediaVolume/.test(runner)) findings.push("restore-specific validators are not used for teardown authority");
  if (!/async function converge\w*Restore\w*Cleanup[\s\S]*attempt\s*<\s*[2-9][\s\S]*confirm\w*Restore\w*Absent/.test(runner)) findings.push("restore teardown has no bounded convergence followed by exact absence confirmation");
  if (!/confirm\w*Restore\w*Absent[\s\S]*com\.docker\.compose\.project[\s\S]*postgres-data[\s\S]*media-data/.test(runner)) findings.push("restore teardown does not inspect exact project containers and both exact volumes");
  if (!/finally\s*\{[\s\S]*Promise\.allSettled[\s\S]*cleanupGeneratedRestoreRoot[\s\S]*cleanupGeneratedBackupRoot[\s\S]*cleanupCanonicalRuntimeAuthority[\s\S]*AggregateError/.test(restoreRunner)) findings.push("restore finalization does not attempt and aggregate every generated authority cleanup");
  if (/await command\("docker-compose", composeArgs\(restoreContext, "down", "--remove-orphans", "--volumes"\), \{ env: composeEnvironment\(restoreContext\), allowFailure: true \}\);/.test(restoreRunner)) findings.push("one ignored Compose down remains the restore cleanup success criterion");

  assert.deepEqual(findings, [], "restore verification must own current origin-bound runtime and prove teardown");
  assert.match(restoreRunner, /\}, \{ env: composeEnvironment\(restoreContext\), composeOverride: restoreContext\.composeOverride \}\)/);
  assert.match(restoreRunner, /compose\(restoreContext, "resolve restored API for authority comparison"/);
});

test("canonical generated production inventory declares current migration count 10", async () => {
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  const pipeline = runner.slice(runner.indexOf("async function runPhase5GeneratedPipeline"), runner.indexOf("async function committedImplementationHead"));
  assert.match(pipeline, /migration:\s*\{\s*count:\s*10,/);
  assert.doesNotMatch(pipeline, /migration:\s*\{\s*count:\s*9,/);
});

test("Phase 4 full runner is offline-preflighted, exhaustive, and ends in machine-checked BLOCKED state", async () => {
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  assert.match(runner, /preflightOfflinePrerequisites/);
  assert.match(runner, /OFFLINE PREREQUISITE MISSING/);
  assert.match(runner, /docker.*history.*--no-trunc/s);
  assert.match(runner, /runPhase4FullChecks/);
  assert.match(runner, /runPhase4SecurityChecks/);
  assert.match(runner, /runPhase4OperationsChecks/);
  assert.match(runner, /runPhase4RestoreChecks/);
  assert.match(runner, /release-gate\.mjs.*--expect-blocked/s);
  assert.match(runner, /LOCAL PHASE 4 READINESS PASS; RELEASE BLOCKED/);
  assert.match(runner, /"security", "operations", "restore", "full"/);
});

test("Phase 3 full is the extensible canonical gate for completed Phase 1/2 and current distribution semantics", async () => {
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  assert.match(runner, /if \(options\.phase3Mode === "full"\) \{\s*await fullPhaseChecks\(context, true\);\s*await runPhase3Checks\(context, "full"\);/s);
  assert.match(runner, /const phase3Modes = \["api", "metadata", "full", "export-api", "export-browser"\]/);
  assert.match(runner, /"export-api": \{ databaseSuites: \[exportApi\], webSuites: \[\] \}/);
  assert.match(runner, /full: \{ databaseSuites: \[api, exportApi\], webSuites: \[metadata, browser\] \}/);
  assert.match(runner, /runStep\(context, "build workspace", "corepack", \["pnpm", "-r", "build"\], \{ env: \{ \.\.\.process\.env, PUBLIC_ORIGIN: context\.publicOrigin \} \}\)/);
  assert.match(runner, /INTERNAL_API_ORIGIN: fixtureOrigin, PUBLIC_ORIGIN: errorWebOrigin/);
  assert.match(runner, /E2E_ERROR_WEB_ORIGIN: errorWebOrigin, E2E_ERROR_FIXTURE_ORIGIN: fixtureOrigin/);
});

test("Phase 3 semantic TAP output fails closed on skip or zero tests", () => {
  assert.doesNotThrow(() => assertSemanticTap("TAP version 13\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n"));
  assert.throws(() => assertSemanticTap("TAP version 13\n# tests 1\n# pass 0\n# skipped 1\n"), /skip/i);
  assert.throws(() => assertSemanticTap("TAP version 13\n# tests 1\n# pass 0\n# todo 1\n"), /todo/i);
  assert.throws(() => assertSemanticTap("TAP version 13\n# tests 0\n# pass 0\n# skipped 0\n"), /zero semantic tests/i);
  assert.throws(() => assertSemanticTap("TAP version 13\nok 1 - skipped case # SKIP missing database\n"), /skip\/todo directive/i);
  assert.throws(() => assertSemanticTap("TAP version 13\nok 1 - deferred case # TODO pending contract\n"), /skip\/todo directive/i);
  assert.throws(() => assertSemanticTap("ℹ tests 7\nℹ pass 7\n"), /TAP|zero semantic tests/i);
  assert.deepEqual(semanticTestCommand("apps/api/test/public-distribution.test.ts"), [
    "node",
    "--import",
    "tsx",
    "--test",
    "--test-reporter=tap",
    "apps/api/test/public-distribution.test.ts",
  ]);
});

test("Phase 5 mixed-output parsers retain actual counts and fail closed", () => {
  assert.deepEqual(parseSemanticTapResult("TAP version 13\n# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n"), {
    tests: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0, todo: 0,
  });
  assert.deepEqual(parsePlaywrightResult("Running 2 tests using 1 worker\n  2 passed"), {
    tests: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0,
  });
  assert.deepEqual(parseBoundaryResult('BLOG X BOUNDARY RESULT {"filesChecked":4,"findings":0,"outcome":"pass"}'), {
    tests: 4, passed: 4, failed: 0, cancelled: 0, skipped: 0, todo: 0,
  });
  for (const output of [
    "TAP version 13\n# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n",
    "TAP version 13\n# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n",
    "TAP version 13\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 1\n",
    "TAP version 13\n# tests 2\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n",
  ]) assert.throws(() => parseSemanticTapResult(output));
  for (const output of ["Running 0 tests using 1 worker", "Running 2 tests using 1 worker\n  1 passed\n  1 skipped", "Running 2 tests using 1 worker\n  2 flaky"]) {
    assert.throws(() => parsePlaywrightResult(output));
  }
  for (const output of ["Boundary checks passed.", 'BLOG X BOUNDARY RESULT {"filesChecked":0,"findings":0,"outcome":"pass"}', 'BLOG X BOUNDARY RESULT {"filesChecked":4,"findings":1,"outcome":"pass"}']) {
    assert.throws(() => parseBoundaryResult(output));
  }
});

test("Phase 5 recorders are per-run, bind redacted bytes, and reject omitted manifests", () => {
  const manifest = { format: "blog-x-phase5-suite-manifest", version: 2, suites: [
    { id: "node-suite", kind: "node", path: "scripts/local-verify.test.mjs", sourceSha256: "a".repeat(64) },
  ] };
  const command = { startedAt: "2026-08-10T14:00:00.000Z", completedAt: "2026-08-10T14:00:01.000Z", exitCode: 0, signal: null,
    combined: "TAP version 13\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\npassword=runtime-secret\n" };
  const first = createPhase5ResultRecorder(manifest, ["runtime-secret"]);
  const second = createPhase5ResultRecorder(manifest, ["runtime-secret"]);
  assert.throws(() => first.finalize(), /missing/i);
  first.recordCommand("node-suite", "node-tap-v13", command, parseSemanticTapResult);
  const firstResult = first.finalize();
  assert.equal(firstResult[0].resultRecord.invocations[0].redactedOutputBytes > 0, true);
  assert.equal(second.has("node-suite"), false);
  assert.throws(() => second.recordCommand("unknown", "node-tap-v13", command, parseSemanticTapResult), /unknown/i);
});

test("Phase 3 Playwright journeys have their own fail-closed result contract", () => {
  assert.doesNotThrow(() => assertPlaywrightJourney("Running 1 test using 1 worker\n  1 passed"));
  assert.throws(() => assertPlaywrightJourney("Running 1 test using 1 worker\n  1 skipped"), /non-pass|zero/i);
  assert.throws(() => assertPlaywrightJourney("Running 0 tests using 1 worker"), /zero/i);
});

test("Phase 3 generated public origins are loopback-only and separate from internal API routing", () => {
  assert.equal(validateLoopbackHttpOrigin("http://127.0.0.1:3100"), "http://127.0.0.1:3100");
  for (const candidate of ["https://example.com", "http://localhost:3100", "http://127.0.0.1/path", "http://127.0.0.1:3100/?q=1", "http://127.0.0.1:3100/#hash"]) {
    assert.throws(() => validateLoopbackHttpOrigin(candidate), /loopback/i);
  }
});

test("Web Dockerfile preserves the dependency cache when the generated public origin changes", async () => {
  const dockerfile = await readFile(join(process.cwd(), "apps/web/Dockerfile"), "utf8");
  const install = dockerfile.indexOf("RUN corepack pnpm install --frozen-lockfile");
  assert.ok(install >= 0, "the Web Dockerfile must install from the lockfile");
  assert.ok(dockerfile.indexOf("ARG PUBLIC_ORIGIN", install) > install, "PUBLIC_ORIGIN must be declared after the dependency install cache layer");
  assert.ok(dockerfile.indexOf("ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}", install) > install, "PUBLIC_ORIGIN must be exported only after dependencies are installed");
});

test("media cleanup accepts only the exact generated root and namespace volume", async () => {
  const namespace = "blogxverify_a1b2c3d4";
  assert.equal(validateDatabaseName("blog_x_a1b2c3d4", namespace), "blog_x_a1b2c3d4");
  for (const candidate of ["", "postgres", "blog_x_other", "blog_x_a1b2c3d4;drop", "blog_x_a1b2c3d4_extra"]) {
    assert.throws(() => validateDatabaseName(candidate, namespace), /database/i);
  }
  assert.equal(validateMediaVolume("blogxverify_a1b2c3d4_media-data", namespace), "blogxverify_a1b2c3d4_media-data");
  for (const candidate of ["", "/", "media-data", "blogxverify_other_media-data", `${namespace}_postgres-data`]) {
    assert.throws(() => validateMediaVolume(candidate, namespace), /media volume/i);
  }

  const root = await mkdtemp(join(tmpdir(), "blog-x-media-verify-"));
  await writeFile(join(root, "proof.txt"), "bounded");
  await cleanupGeneratedMediaRoot(root);
  await assert.rejects(stat(root), /ENOENT/);
  for (const candidate of ["/", tmpdir(), join(tmpdir(), "blog-x-media"), process.cwd()]) {
    await assert.rejects(cleanupGeneratedMediaRoot(candidate), /generated media root/i);
  }
});

test("captured output redacts credentials, session material, and database URLs", () => {
  const password = "runtime-password-value";
  const token = "runtime-cookie-value";
  const databaseUrl = ["postgres://local_user", "local_password@postgres:5432/local_database"].join(":");
  const redacted = redactText([
    `password=${password}`,
    `Cookie: blog_x_session=${token}`,
    `Set-Cookie: blog_x_session=${token}; HttpOnly`,
    `DATABASE_URL=${databaseUrl}`,
  ].join("\n"), [password, token, databaseUrl]);

  assert.doesNotMatch(redacted, new RegExp(password));
  assert.doesNotMatch(redacted, new RegExp(token));
  assert.doesNotMatch(redacted, /postgres:\/\//);
  assert.match(redacted, /\[REDACTED\]/);
});

test("boundary audit rejects database/media ownership, forbidden public origins, test routes, server addresses, frozen-host commands, and tracked secrets", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "blog-x-boundary-"));
  context.after(async () => { await rm(fixtureRoot, { recursive: true, force: true }); });
  await mkdir(join(fixtureRoot, "apps/web/app"), { recursive: true });
  await mkdir(join(fixtureRoot, "apps/web/app/api/diagnostic"), { recursive: true });
  await mkdir(join(fixtureRoot, "scripts"), { recursive: true });
  const frozenAddress = [47, 99, 80, 8].join(".");
  const secondaryAddress = [124, 222, 91, 230].join(".");
  const files = [
    "apps/web/app/leak.ts",
    "apps/web/app/direct-client.ts",
    "apps/web/app/media-processor.ts",
    "apps/web/app/media-key.ts",
    "apps/web/app/leaked-origin.ts",
    "apps/web/app/outbound-request.ts",
    "apps/web/app/production-host.ts",
    "apps/web/app/api/diagnostic/route.ts",
    "scripts/deploy.sh",
    ".env.production",
  ];
  await writeFile(join(fixtureRoot, files[0]), 'import { Pool } from "pg";\n');
  await writeFile(join(fixtureRoot, files[1]), `fetch("http://${secondaryAddress}:3001/health");\n`);
  await writeFile(join(fixtureRoot, files[2]), 'import fs from "node:fs"; import sharp from "sharp";\n');
  await writeFile(join(fixtureRoot, files[3]), 'const sourceKey = "source/private.bin";\n');
  await writeFile(join(fixtureRoot, files[4]), 'export const canonical = "http://api:3001/posts/private";\n');
  await writeFile(join(fixtureRoot, files[5]), 'fetch("https://example.com/collect");\n');
  await writeFile(join(fixtureRoot, files[6]), 'export const host = "https://huajieyu001.top";\n');
  await writeFile(join(fixtureRoot, files[7]), 'export async function GET() { return Response.json({ diagnostic: true }); }\n');
  await writeFile(join(fixtureRoot, files[8]), `ssh root@${frozenAddress} true\n`);
  await writeFile(join(fixtureRoot, files[9]), "ADMIN_PASSWORD=committed-secret\n");

  const issues = await auditFiles(fixtureRoot, files);
  assert.equal(issues.some((issue) => issue.code === "web_database_ownership"), true);
  assert.equal(issues.some((issue) => issue.code === "web_filesystem_ownership"), true);
  assert.equal(issues.some((issue) => issue.code === "web_media_processor_ownership"), true);
  assert.equal(issues.some((issue) => issue.code === "web_media_storage_leak"), true);
  assert.equal(issues.some((issue) => issue.code === "web_internal_origin_disclosure"), true);
  assert.equal(issues.some((issue) => issue.code === "web_outbound_request"), true);
  assert.equal(issues.some((issue) => issue.code === "web_hardcoded_public_origin"), true);
  assert.equal(issues.some((issue) => issue.code === "web_public_diagnostic_route"), true);
  assert.equal(issues.some((issue) => issue.code === "browser_server_address"), true);
  assert.equal(issues.some((issue) => issue.code === "frozen_host_command"), true);
  assert.equal(issues.some((issue) => issue.code === "tracked_secret_file"), true);
});

test("release artifact audit rejects automatic remote capability, tracked READY, public data planes, address leakage, and false live claims", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "blog-x-release-boundary-"));
  context.after(async () => { await rm(fixtureRoot, { recursive: true, force: true }); });
  await mkdir(join(fixtureRoot, "scripts/release-gate"), { recursive: true });
  await mkdir(join(fixtureRoot, "ops"), { recursive: true });
  await mkdir(join(fixtureRoot, "docs"), { recursive: true });
  const files = ["scripts/release-gate/deploy.mjs", "ops/release-evidence.blocked.json", "docs/RELEASE-GATE.md", "docs/ROLLBACK.md"];
  await writeFile(join(fixtureRoot, files[0]), 'import { execFile } from "node:child_process"; execFile("ssh", ["cloud-node", "deploy"]);\n');
  await writeFile(join(fixtureRoot, files[1]), JSON.stringify({ format: "blog-x-release-evidence", version: 1, state: "READY" }));
  await writeFile(join(fixtureRoot, files[2]), 'Production READY; TLS verified; RPO 1h; browser calls http://api:3001; API port "3001:3001".\n');
  await writeFile(join(fixtureRoot, files[3]), 'Run curl against node authority, then automatic deploy and unfreeze.\n');
  const issues = await auditFiles(fixtureRoot, files);
  for (const code of ["release_remote_capability", "tracked_release_ready", "release_internal_authority", "release_public_data_plane", "false_production_claim", "automatic_release_action"]) {
    assert.equal(issues.some((finding) => finding.code === code), true, code);
  }
});
