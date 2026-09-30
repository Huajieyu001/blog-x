import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { INTEGRATION_TEST_FILES, assertCompleteTestInventory } from "./test-inventory.mjs";

import {
  FAST_LOCAL_PREVIEW_READY,
  assertFastPreviewArgv,
  buildFastPreviewEnvironment,
  createFastLocalPreviewPlan,
  runFastLocalPreview,
} from "./refresh-local-preview.mjs";

const ambient = Object.freeze({
  PATH: "/safe/bin",
  HOME: "/safe/home",
  TMPDIR: "/safe/tmp",
  LANG: "zh_CN.UTF-8",
  LC_ALL: "zh_CN.UTF-8",
  DOCKER_HOST: "tcp://outside.example:2375",
  COMPOSE_FILE: "/outside/compose.yaml",
  BLOG_X_WEB_PORT: "9999",
});

test("fast preview plan uses only the fixed local Compose cutover and narrow smoke", () => {
  assert.deepEqual(createFastLocalPreviewPlan(), [
    { command: "corepack", args: ["pnpm", "-r", "typecheck"] },
    { command: "docker-compose", args: ["-p", "blogxlocal", "-f", "compose.yaml", "build", "api"] },
    { command: "docker-compose", args: ["-p", "blogxlocal", "-f", "compose.yaml", "build", "web"] },
    { command: "docker-compose", args: ["-p", "blogxlocal", "-f", "compose.yaml", "up", "-d", "--wait", "api", "web"] },
    { command: "corepack", args: ["pnpm", "exec", "playwright", "test", "--config=scripts/local-preview.playwright.config.ts", "scripts/local-preview-smoke.spec.ts", "--workers=1"] },
  ]);
});

test("fast preview strips ambient Compose and Docker routing variables", () => {
  assert.deepEqual(buildFastPreviewEnvironment(ambient), {
    PATH: "/safe/bin",
    HOME: "/safe/home",
    TMPDIR: "/safe/tmp",
    LANG: "zh_CN.UTF-8",
    LC_ALL: "zh_CN.UTF-8",
  });
});

test("fast preview runs its sealed sequence and reports readiness only after smoke passes", async () => {
  const calls = [];
  const output = [];
  await runFastLocalPreview({
    ambientEnv: ambient,
    runCommand: async (command, args, options) => { calls.push({ command, args, options }); },
    write: (line) => output.push(line),
  });

  assert.deepEqual(calls.map(({ command, args }) => ({ command, args })), createFastLocalPreviewPlan());
  for (const call of calls) {
    assert.deepEqual(call.options.env, buildFastPreviewEnvironment(ambient));
    assert.equal(call.options.cwd.endsWith("blog-x"), true);
  }
  assert.deepEqual(output, [`${FAST_LOCAL_PREVIEW_READY}\n`]);
});

test("fast preview propagates a failed stage and never claims readiness", async () => {
  const output = [];
  await assert.rejects(
    runFastLocalPreview({
      ambientEnv: ambient,
      runCommand: async (command) => {
        if (command === "docker-compose") throw new Error("build failed");
      },
      write: (line) => output.push(line),
    }),
    /build failed/,
  );
  assert.deepEqual(output, []);
});

test("fast preview refuses caller arguments and excludes acceptance, evidence, and remote operations", async () => {
  const source = await readFile(new URL("./refresh-local-preview.mjs", import.meta.url), "utf8");
  assert.doesNotThrow(() => assertFastPreviewArgv(["node", "scripts/refresh-local-preview.mjs"]));
  assert.throws(() => assertFastPreviewArgv(["node", "scripts/refresh-local-preview.mjs", "--other-project"]), /accepts no arguments/);
  assert.doesNotMatch(source, /local-delivery-acceptance|ops\/local-deliveries|\bssh\b|\bscp\b|\bdeploy\b|\bprune\b|\bdown\b/i);
});

test("package scripts add the preview path without changing the full delivery command", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["local:deliver"], "node scripts/refresh-local.mjs");
  assert.equal(packageJson.scripts["local:preview"], "node scripts/refresh-local-preview.mjs");
  assert.equal(packageJson.scripts["test:local-preview"], "node --test scripts/refresh-local-preview.test.mjs");
});

test("preview-only smoke stays outside the canonical integration inventory", async () => {
  assert.equal(INTEGRATION_TEST_FILES.includes("scripts/local-preview-smoke.spec.ts"), false);
  assert.deepEqual(await assertCompleteTestInventory(), { total: 55, default: 18, integration: 37 });
});
