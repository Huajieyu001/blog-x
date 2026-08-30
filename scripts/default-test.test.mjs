import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  DEFAULT_TEST_CHILDREN,
  parseDefaultTapResult,
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
      argv: ["--import", "tsx", "--test", "--test-reporter=tap", "packages/contracts/src/public-discovery.test.ts", "packages/contracts/src/tracer.test.ts"],
    },
    {
      id: "api",
      argv: ["--import", "tsx", "--test", "--test-reporter=tap", "apps/api/test/markdown-renderer.test.ts", "apps/api/test/security-hardening.test.ts"],
    },
    {
      id: "web",
      argv: ["--import", "tsx", "--test", "--test-reporter=tap", "apps/web/app/lib/search-discovery.test.ts", "apps/web/app/lib/site-metadata.test.ts", "apps/web/lib/search-encoding.test.ts"],
    },
  ]);
  assert.deepEqual(DEFAULT_TEST_CHILDREN.flatMap((child) => child.argv.filter((value) => value.endsWith(".test.ts"))), DEFAULT_TEST_FILES);
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
  const cause = `prefix postgres://blog_x:secret@127.0.0.1/blog_x\n${"x".repeat(80_000)}\nterminal-cause`;
  assert.throws(
    () => validateDefaultTestChildResult("api", { exitCode: 1, signal: null, output: cause, truncated: true }),
    (error) => {
      assert.match(error.message, /default test child api failed/);
      assert.match(error.message, /terminal-cause/);
      assert.match(error.message, /output truncated/i);
      assert.doesNotMatch(error.message, /secret/);
      assert.ok(Buffer.byteLength(error.message) < 70_000);
      return true;
    },
  );
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
