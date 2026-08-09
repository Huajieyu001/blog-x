import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditFiles } from "./check-boundaries.mjs";
import {
  assertSemanticTap,
  assertPlaywrightJourney,
  cleanupGeneratedMediaRoot,
  phase3Selection,
  redactText,
  semanticTestCommand,
  validateDatabaseName,
  validateLoopbackHttpOrigin,
  validateMediaVolume,
  validateNamespace,
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
    databaseSuites: [["PHASE3_TEST_DATABASE_URL", "apps/api/test/public-distribution.test.ts"]],
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

test("Phase 3 full is the extensible canonical gate for completed Phase 1/2 and current distribution semantics", async () => {
  const runner = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  assert.match(runner, /if \(options\.phase3Mode === "full"\) \{\s*await fullPhaseChecks\(context, true\);\s*await runPhase3Checks\(context, "full"\);/s);
  assert.match(runner, /const phase3Modes = \["api", "metadata", "full", "export-api", "export-browser"\]/);
  assert.match(runner, /"export-api": \{ databaseSuites: \[exportApi\], webSuites: \[\] \}/);
  assert.match(runner, /runStep\(context, "build workspace", "corepack", \["pnpm", "-r", "build"\], \{ env: \{ \.\.\.process\.env, PUBLIC_ORIGIN: context\.publicOrigin \} \}\)/);
  assert.match(runner, /INTERNAL_API_ORIGIN: fixtureOrigin, PUBLIC_ORIGIN: errorWebOrigin/);
  assert.match(runner, /E2E_ERROR_WEB_ORIGIN: errorWebOrigin, E2E_ERROR_FIXTURE_ORIGIN: fixtureOrigin/);
});

test("Phase 3 semantic TAP output fails closed on skip or zero tests", () => {
  assert.doesNotThrow(() => assertSemanticTap("TAP version 13\n# tests 2\n# pass 2\n# fail 0\n# skipped 0\n# todo 0\n"));
  assert.throws(() => assertSemanticTap("TAP version 13\n# tests 1\n# pass 0\n# skipped 1\n"), /skip/i);
  assert.throws(() => assertSemanticTap("TAP version 13\n# tests 1\n# pass 0\n# todo 1\n"), /todo/i);
  assert.throws(() => assertSemanticTap("TAP version 13\n# tests 0\n# pass 0\n# skipped 0\n"), /zero semantic tests/i);
  assert.throws(() => assertSemanticTap("TAP version 13\nok 1 - skipped case # SKIP missing database\n"), /skip\/todo directive/i);
  assert.throws(() => assertSemanticTap("TAP version 13\nok 1 - deferred case # TODO pending contract\n"), /skip\/todo directive/i);
  assert.throws(() => assertSemanticTap("ℹ tests 7\nℹ pass 7\n"), /zero semantic tests/i);
  assert.deepEqual(semanticTestCommand("apps/api/test/public-distribution.test.ts"), [
    "node",
    "--import",
    "tsx",
    "--test",
    "--test-reporter=tap",
    "apps/api/test/public-distribution.test.ts",
  ]);
});

test("Phase 3 Playwright journeys have their own fail-closed result contract", () => {
  assert.doesNotThrow(() => assertPlaywrightJourney("Running 1 test using 1 worker\n  1 passed"));
  assert.throws(() => assertPlaywrightJourney("Running 1 test using 1 worker\n  1 skipped"), /skipped/i);
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
