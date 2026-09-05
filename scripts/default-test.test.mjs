import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  DEFAULT_TEST_CHILDREN,
  buildDefaultTestEnvironment,
  parseDefaultTapResult,
  redactDefaultTestDiagnostic,
  runDefaultTests,
  validateDefaultTestChildResult,
} from "./default-test.mjs";
import { DEFAULT_TEST_FILES } from "./test-inventory.mjs";

const passTap = (tests = 2) => `TAP version 13
1..${tests}
# tests ${tests}
# suites 0
# pass ${tests}
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1
`;

test("default coordinator freezes exact literal Contracts, API and Web child argv", () => {
  assert.equal(Object.isFrozen(DEFAULT_TEST_CHILDREN), true);
  assert.equal(DEFAULT_TEST_CHILDREN.every((child) => Object.isFrozen(child) && Object.isFrozen(child.argv)), true);
  assert.deepEqual(DEFAULT_TEST_CHILDREN, [
    {
      id: "contracts",
      argv: ["--import", "tsx", "--test", "--test-reporter=tap", "packages/contracts/src/analytics.test.ts", "packages/contracts/src/public-discovery.test.ts", "packages/contracts/src/tracer.test.ts"],
    },
    {
      id: "api",
      argv: ["--import", "tsx", "--test", "--test-reporter=tap", "apps/api/test/markdown-renderer.test.ts", "apps/api/test/security-hardening.test.ts", "apps/api/test/public-view-security.test.ts"],
    },
    {
      id: "web",
      argv: ["--import", "tsx", "--test", "--test-reporter=tap", "apps/web/app/admin/_components/article-actions-schedule.test.ts", "apps/web/app/admin/_components/article-editor-recovery.test.ts", "apps/web/app/lib/admin-analytics.test.ts", "apps/web/app/lib/search-discovery.test.ts", "apps/web/app/lib/site-metadata.test.ts", "apps/web/lib/search-encoding.test.ts", "apps/web/server.test.mjs"],
    },
  ]);
  assert.deepEqual(DEFAULT_TEST_CHILDREN.flatMap((child) => child.argv.filter((value) => /\.test\.(?:ts|mjs)$/.test(value))), DEFAULT_TEST_FILES);
});

test("semantic TAP parser requires nonzero pass-only arithmetic", () => {
  assert.deepEqual(parseDefaultTapResult(passTap(3), "contracts"), {
    tests: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0, todo: 0,
  });
  assert.throws(() => parseDefaultTapResult(passTap(0), "zero"), /zero.*zero tests/i);
  assert.throws(() => parseDefaultTapResult(passTap(2).replace("# pass 2", "# pass 1").replace("# fail 0", "# fail 1"), "fail"), /fail.*non-pass/i);
  assert.throws(() => parseDefaultTapResult(passTap(2).replace("# pass 2", "# pass 1").replace("# cancelled 0", "# cancelled 1"), "cancel"), /cancel.*non-pass/i);
  assert.throws(() => parseDefaultTapResult(passTap(2).replace("# pass 2", "# pass 1").replace("# skipped 0", "# skipped 1"), "skip"), /skip.*non-pass/i);
  assert.throws(() => parseDefaultTapResult(passTap(2).replace("# pass 2", "# pass 1").replace("# todo 0", "# todo 1"), "todo"), /todo.*non-pass/i);
  assert.throws(() => parseDefaultTapResult("", "absent"), /absent.*TAP version 13/i);
  assert.throws(() => parseDefaultTapResult("TAP version 13\n# tests 1\n", "malformed"), /malformed.*pass footer/i);
});

test("child failure reports its layer and bounded redacted cause", () => {
  const sensitiveValue = ["sensitive", "value"].join("-");
  const databaseScheme = ["postgres", "ql"].join("");
  const cause = `prefix ${databaseScheme}://blog_x:${sensitiveValue}@127.0.0.1/blog_x\n${"x".repeat(80_000)}\nterminal-cause`;
  assert.throws(
    () => validateDefaultTestChildResult("api", { exitCode: 1, signal: null, output: cause, truncated: true }),
    (error) => {
      assert.match(error.message, /default test child api failed/);
      assert.match(error.message, /terminal-cause/);
      assert.match(error.message, /output truncated/i);
      assert.doesNotMatch(error.message, new RegExp(sensitiveValue));
      assert.ok(Buffer.byteLength(error.message) < 70_000);
      return true;
    },
  );
});

test("default children receive only the exact non-secret process environment", () => {
  const databaseScheme = ["postgres", "ql"].join("");
  const environment = buildDefaultTestEnvironment({
    PATH: "/usr/bin:/bin",
    HOME: "/Users/test",
    TMPDIR: "/private/tmp",
    LANG: "en_US.UTF-8",
    LC_ALL: "C",
    NODE_OPTIONS: "--inspect",
    DATABASE_URL: `${databaseScheme}://user:database-secret@host/db`,
    ADMIN_PASSWORD: "administrator-secret",
    GH_TOKEN: "github-secret",
    E2E_REVOKED_SESSION_TOKEN: "session-secret",
    BLOG_X_API_IMAGE: "alternate-image",
    DOCKER_HOST: "tcp://remote.example:2375",
  });
  assert.deepEqual(environment, {
    PATH: "/usr/bin:/bin",
    HOME: "/Users/test",
    TMPDIR: "/private/tmp",
    LANG: "en_US.UTF-8",
    LC_ALL: "C",
  });
  assert.equal(Object.isFrozen(environment), true);
});

test("default diagnostics redact prefixed structured secrets before bounded reporting", () => {
  const databaseScheme = ["postgres", "ql"].join("");
  const pairs = [
    ["ADMIN_PASSWORD=administrator-secret", "administrator-secret"],
    ["E2E_REVOKED_SESSION_TOKEN: session-secret", "session-secret"],
    ["GH_TOKEN='github-secret'", "github-secret"],
    ['{"api_key":"json-secret"}', "json-secret"],
    [`{"DATABASE_URL":"${databaseScheme}://user:database-secret@host/db"}`, "database-secret"],
    ["Authorization: Bearer bearer-secret", "bearer-secret"],
    ["Cookie: account=cookie-secret; preference=preference-secret", "cookie-secret"],
    ["Set-Cookie: blog_x_session=session-cookie; HttpOnly", "session-cookie"],
    ["redis://user:redis-secret@127.0.0.1:6379/0", "redis-secret"],
  ];
  for (const [diagnostic, secret] of pairs) {
    const redacted = redactDefaultTestDiagnostic(diagnostic);
    assert.doesNotMatch(redacted, new RegExp(secret));
    assert.match(redacted, /\[REDACTED(?:_DATABASE_URL)?\]/);
  }
});

test("default coordinator source uses one bounded detached child tree per layer", async () => {
  const source = await readFile(new URL("./default-test.mjs", import.meta.url), "utf8");
  assert.match(source, /runBoundedChildTree/);
  assert.match(source, /childTimeoutMs\s*=\s*120_000/);
  assert.match(source, /terminationGraceMs:\s*5_000/);
  assert.match(source, /killGraceMs:\s*3_000/);
  assert.match(source, /maximumOutputBytes:\s*maximumChildOutputBytes/);
  assert.doesNotMatch(source, /env:\s*\{\s*\.\.\.process\.env/);
});

test("default coordinator rejects path arguments and authority-changing environment", () => {
  const extra = spawnSync(process.execPath, ["scripts/default-test.mjs", "apps/api/test/markdown-renderer.test.ts"], { encoding: "utf8" });
  assert.notEqual(extra.status, 0);
  assert.match(`${extra.stdout}${extra.stderr}`, /accepts no arguments/);

  const overridden = spawnSync(process.execPath, ["scripts/default-test.mjs"], {
    encoding: "utf8",
    env: { ...process.env, BLOG_X_DEFAULT_TEST_FILES: "apps/api/test/markdown-renderer.test.ts" },
  });
  assert.notEqual(overridden.status, 0);
  assert.match(`${overridden.stdout}${overridden.stderr}`, /environment overrides are forbidden.*BLOG_X_DEFAULT_TEST_FILES/i);
});

test("default coordinator executes every layer and emits a nonzero pass-only aggregate", async () => {
  const result = await runDefaultTests();
  assert.deepEqual(result.layers.map((layer) => layer.id), ["contracts", "api", "web"]);
  assert.equal(result.layers.every((layer) => layer.counts.tests > 0 && layer.counts.tests === layer.counts.passed), true);
  assert.ok(result.counts.tests > 0);
  assert.equal(result.counts.tests, result.counts.passed);
  assert.deepEqual(
    { failed: result.counts.failed, cancelled: result.counts.cancelled, skipped: result.counts.skipped, todo: result.counts.todo },
    { failed: 0, cancelled: 0, skipped: 0, todo: 0 },
  );
});

test("root and API scripts expose exact default and integration authorities", async () => {
  const rootPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const apiPackage = JSON.parse(await readFile(new URL("../apps/api/package.json", import.meta.url), "utf8"));
  assert.equal(rootPackage.scripts.test, "node scripts/default-test.mjs");
  assert.equal(rootPackage.scripts["test:integration"], "node scripts/local-delivery-acceptance.mjs");
  assert.equal(apiPackage.scripts.test, "tsx --test --test-reporter=tap test/markdown-renderer.test.ts test/security-hardening.test.ts");
});
