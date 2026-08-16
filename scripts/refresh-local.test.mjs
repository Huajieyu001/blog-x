import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createStoreManifest,
  prepareSeedStore,
  validateStorePaths,
} from "./refresh-seed-store.mjs";
import {
  FIXED_REFRESH,
  createRefreshPlan,
  inspectTargetFilesystem,
  runLocalRefresh,
} from "./refresh-local.mjs";

async function fixtureStore(t) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-refresh-seed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "workspace", ".pnpm-store", "v10");
  const neutral = join(root, "pnpm-store", "v10");
  await mkdir(join(source, "files"), { recursive: true });
  await writeFile(join(source, "files", "package.tgz"), "seed-package");
  await symlink("files/package.tgz", join(source, "package-link"));
  return { root, source, neutral };
}

function fakeRunner(values) {
  const calls = [];
  return {
    calls,
    async run(command, args) {
      calls.push([command, args]);
      const value = values.shift();
      if (!value) throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
      return { stdout: `${value}\n` };
    },
  };
}

test("seed relocation computes both pnpm paths with exact argv and preserves a versioned store", async (t) => {
  const { root, source, neutral } = await fixtureStore(t);
  const runner = fakeRunner([source, neutral]);

  const result = await prepareSeedStore({ cwd: root, run: runner.run });

  assert.deepEqual(runner.calls, [
    ["corepack", ["pnpm", "store", "path"]],
    ["corepack", ["pnpm", "--store-dir=/pnpm-store", "store", "path"]],
  ]);
  assert.equal(result.neutralStore, neutral);
  assert.deepEqual(await createStoreManifest(neutral), result.manifest);
  await assert.rejects(readFile(join(root, "workspace", ".pnpm-store", "v10", "files", "package.tgz")));
  await assert.rejects(readFile(join(root, "workspace", "marker")));
});

test("seed relocation waits for a verified complete copy before it deletes a store inside /workspace", async (t) => {
  const { root, source, neutral } = await fixtureStore(t);
  await writeFile(join(root, "workspace", "marker"), "legacy-source");
  const runner = fakeRunner([source, neutral]);
  const result = await prepareSeedStore({ cwd: root, run: runner.run });
  assert.equal(result.removedWorkspace, true);
  await assert.rejects(readFile(join(root, "workspace", "marker")));
  assert.equal((await readFile(join(neutral, "files", "package.tgz"), "utf8")), "seed-package");
});

test("unsafe, equal, root, unversioned and flattened store paths fail before deletion", async (t) => {
  const { root, source, neutral } = await fixtureStore(t);
  for (const paths of [
    { sourceStore: "/", neutralStore: neutral },
    { sourceStore: source, neutralStore: source },
    { sourceStore: source, neutralStore: join(root, "pnpm-store") },
    { sourceStore: join(root, "other", "v10"), neutralStore: neutral },
  ]) {
    assert.throws(() => validateStorePaths(paths), /store path|version|distinct|source/i);
  }
  const runner = fakeRunner([source, join(root, "pnpm-store", "v10")]);
  await assert.rejects(prepareSeedStore({ cwd: root, run: runner.run, copy: async () => undefined }), /manifest/i);
  assert.equal(await readFile(join(source, "files", "package.tgz"), "utf8"), "seed-package");
});

test("refresh plan has one fixed local authority and offline two-image barrier before mutation", () => {
  const plan = createRefreshPlan({ revision: "a".repeat(40), lockSha256: "b".repeat(64), apiSeedId: "sha256:api", webSeedId: "sha256:web" });
  assert.deepEqual(FIXED_REFRESH, {
    project: "blogxlocal",
    origin: "http://127.0.0.1:3100",
    services: ["api", "web"],
    volumes: ["blogxlocal_postgres-data", "blogxlocal_media-data"],
  });
  assert.deepEqual(plan.targets.map((target) => target.tag), [
    "blog-x-api-local:aaaaaaaaaaaa",
    "blog-x-web-local:aaaaaaaaaaaa",
  ]);
  assert.ok(plan.preMutation.every((command) => command.args.includes("--network=none") || command.args.includes("--pull=false") || command.readOnly));
  assert.ok(plan.phases.indexOf("inspect-target-images") < plan.phases.indexOf("migrate"));
  assert.ok(plan.phases.indexOf("migrate") < plan.phases.indexOf("cutover-api-web"));
});

test("target filesystem inspection rejects legacy workspace, flattened stores, old build output and non-refresh commands", () => {
  const good = {
    workdir: "/refresh-workspace",
    cmd: ["corepack", "pnpm", "--filter", "@blog-x/web", "exec", "next", "start"],
    neutralStore: "/pnpm-store/v10",
    storePath: "/pnpm-store/v10",
    paths: ["/refresh-workspace/apps/web/.next", "/pnpm-store/v10/files/index"],
  };
  assert.doesNotThrow(() => inspectTargetFilesystem(good));
  for (const bad of [
    { ...good, paths: [...good.paths, "/workspace/apps/web/seed-marker"] },
    { ...good, paths: [...good.paths, "/pnpm-store/files/flattened"] },
    { ...good, paths: [...good.paths, "/refresh-workspace/apps/web/dist"] },
    { ...good, workdir: "/workspace" },
    { ...good, cmd: ["node", "/workspace/apps/api/src/app.ts"] },
  ]) assert.throws(() => inspectTargetFilesystem(bad), /workspace|store|legacy|refresh/i);
});

test("a post-start failure rolls back only api and web and suppresses evidence", async () => {
  const events = [];
  await assert.rejects(runLocalRefresh({
    adapter: {
      async execute(step) {
        events.push(step);
        if (step === "routes") throw new Error("route contract failed");
      },
    },
  }), /route contract failed/);
  assert.deepEqual(events, ["preflight", "build-api", "build-web", "inspect-target-images", "migrate", "schema-verify", "cutover-api-web", "routes", "rollback-api-web", "verify-rollback"]);
  assert.equal(events.includes("write-evidence"), false);
  assert.equal(events.some((event) => /postgres|volume|down/.test(event)), false);
});

test("successful refresh writes sanitized evidence only after route and BLOCKED checks", async () => {
  const events = [];
  const evidence = await runLocalRefresh({ adapter: { async execute(step) { events.push(step); } } });
  assert.deepEqual(events, ["preflight", "build-api", "build-web", "inspect-target-images", "migrate", "schema-verify", "cutover-api-web", "routes", "release-blocked", "write-evidence"]);
  assert.equal(evidence.releaseState, "BLOCKED");
  assert.equal("credentials" in evidence, false);
});

test("source contracts require neutral stores, offline frozen installs and sanitized refresh workspaces", async () => {
  for (const file of ["apps/api/Dockerfile.refresh", "apps/web/Dockerfile.refresh"]) {
    const dockerfile = await readFile(file, "utf8");
    assert.match(dockerfile, /refresh-seed-store\.mjs/);
    assert.match(dockerfile, /--store-dir=\/pnpm-store --offline --frozen-lockfile/);
    assert.match(dockerfile, /\/refresh-workspace/);
    assert.match(dockerfile, /--network=none/);
    assert.match(dockerfile, /rm -rf \/workspace/);
  }
});
