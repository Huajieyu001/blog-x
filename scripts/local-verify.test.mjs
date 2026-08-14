import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditFiles } from "./check-boundaries.mjs";
import {
  assertSemanticTap,
  assertPlaywrightJourney,
  createPhase5ResultRecorder,
  parseBoundaryResult,
  parsePlaywrightResult,
  parseSemanticTapResult,
  cleanupGeneratedMediaRoot,
  phase3Selection,
  phase4Selection,
  phase5Selection,
  phase5MediaSelection,
  redactText,
  semanticTestCommand,
  validateDatabaseName,
  validateLoopbackHttpOrigin,
  validateMediaVolume,
  validateNamespace,
  validateTopologyPolicy,
} from "./local-verify.mjs";

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

test("Phase 5 media selection owns seventh-migration and legacy restore evidence", async () => {
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
  assert.match(runner, /values\[1\] !== 7/);
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
  assert.ok(full.indexOf("runPhase4ReleaseChecks") < runner.indexOf("await writePhase5ReceiptAtomic"));
  assert.match(runner, /cleanupPhase5ProductionAuthorities/);
  assert.match(runner, /restoreVerifierOwnedNextEnvironment/);
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
