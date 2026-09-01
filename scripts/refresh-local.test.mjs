import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  assessDockerBuildCapacity,
  createRefreshPlan,
  inspectTargetFilesystem,
  runLocalRefresh,
  runRefreshCli,
} from "./refresh-local.mjs";
import {
  assertAllowedRefreshCommand,
} from "./refresh-local-live.mjs";
import { createRefreshTestRuntime } from "./refresh-local-test-core.mjs";
import {
  SEED_PREREQUISITE_KINDS,
  HISTORICAL_CLAIM_ROOT,
  HISTORICAL_SUCCESSOR_2_CLAIM_ROOT,
  HISTORICAL_SUCCESSOR_2_LOCAL_DELIVERY_EVIDENCE_PATH,
  HISTORICAL_LOCAL_DELIVERY_EVIDENCE_PATH,
  LOCAL_DELIVERY_CLAIM_ROOT,
  LOCAL_DELIVERY_EVIDENCE_DIRECTORY,
  REFRESH_FAILURE_CLASSES,
  REFRESH_TERMINAL_STAGES,
  SAFE_RECOVERY_BY_STAGE,
  assertSeedPrerequisiteFacts,
  classifySeedPrerequisiteFailure,
  formatRefreshFailure,
  formatRefreshStageProgress,
  formatSeedPrewarmInstruction,
  deliveryAuthorityForRevision,
  parseRevisionAddressedEvidencePath,
  safeRecoveryForRefreshFailure,
} from "./refresh-local-runtime-core.mjs";
import {
  assertCanonicalPortOwner,
  assertFixedRuntimeAuthority,
  assertPersistenceTransition,
  assertReadingFact,
  assertRouteFacts,
  collectRefreshFacts,
  factsSha256,
  projectSanitizedFacts,
} from "./refresh-local-facts.mjs";
import { PACKAGE_TEST_INVENTORY } from "./test-inventory.mjs";

const TEST_REVISION = "a".repeat(40);
const TEST_EVIDENCE_PATH = deliveryAuthorityForRevision(TEST_REVISION).evidencePath;
const TEST_UID = process.getuid?.();
if (!Number.isSafeInteger(TEST_UID) || TEST_UID < 0) throw new Error("refresh tests require a valid Unix uid");

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

function memoryClaimFs(uid = TEST_UID) {
  const entries = new Map([
    ["/private", { kind: "dir", uid: 0, mode: 0o755 }],
    ["/private/tmp", { kind: "dir", uid: 0, mode: 0o1777 }],
  ]);
  const error = (code) => Object.assign(new Error(code), { code });
  const statFor = (item) => ({
    uid: item.uid, mode: item.mode,
    isDirectory: () => item.kind === "dir", isFile: () => item.kind === "file", isSymbolicLink: () => item.kind === "symlink",
  });
  return {
    entries,
    async lstat(path) { const item = entries.get(path); if (!item) throw error("ENOENT"); return statFor(item); },
    async realpath(path) { if (!entries.has(path)) throw error("ENOENT"); return path; },
    async mkdir(path, options) { if (entries.has(path)) throw error("EEXIST"); entries.set(path, { kind: "dir", uid, mode: options.mode }); },
    async open(path, flags, mode) {
      if (flags === "wx") { if (entries.has(path)) throw error("EEXIST"); entries.set(path, { kind: "file", uid, mode, bytes: "" }); }
      else if (flags !== "r" || entries.get(path)?.kind !== "dir") throw error("ENOENT");
      return { async writeFile(bytes) { entries.get(path).bytes = bytes; }, async sync() {}, async close() {} };
    },
    async link(source, target) { if (entries.has(target)) throw error("EEXIST"); const item = entries.get(source); if (!item) throw error("ENOENT"); entries.set(target, { ...item }); },
    async unlink(path) { if (!entries.delete(path)) throw error("ENOENT"); },
    async readFile(path) { const item = entries.get(path); if (!item) throw error("ENOENT"); return item.bytes; },
  };
}

function fakeClaimStore() {
  const fs = memoryClaimFs();
  return { fs, store: testRuntime(fs, () => "1".repeat(24)).createAttemptStore() };
}

function testRuntime(fs, randomHex = () => "1".repeat(24), processBoundary = async () => ({ stdout: "" }), fetch = async () => { throw new Error("unused fake fetch"); }, clock = () => undefined) {
  return createRefreshTestRuntime({ fs, randomHex, processBoundary, fetch, clock });
}

function memoryArtifactFs(root = "/virtual-workspace", uid = TEST_UID) {
  const entries = new Map([
    [root, { kind: "dir", bytes: "", uid, mode: 0o755 }],
    [`${root}/ops`, { kind: "dir", bytes: "", uid, mode: 0o755 }],
    [`${root}/ops/local-deliveries`, { kind: "dir", bytes: "", uid, mode: 0o755 }],
    [`${root}/pnpm-lock.yaml`, { kind: "file", bytes: "raw-lock\n", uid, mode: 0o600 }],
    [`${root}/ops/phase5-full-gate-receipt.json`, { kind: "file", bytes: "receipt\n", uid, mode: 0o600 }],
    [`${root}/.planning/phases/06-public-discovery-data/06-VERIFICATION.md`, { kind: "file", bytes: "verified\n", uid, mode: 0o600 }],
    ["/private", { kind: "dir", uid: 0, mode: 0o755 }],
    ["/private/tmp", { kind: "dir", uid: 0, mode: 0o1777 }],
    ["/Users/test/.colima/default/docker.sock", { kind: "socket", uid, mode: 0o600 }],
  ]);
  const error = (code) => Object.assign(new Error(code), { code });
  return {
    entries,
    async lstat(path) { const item = entries.get(path); if (!item) throw error("ENOENT"); return { uid: item.uid, mode: item.mode, nlink: item.nlink ?? 1, isFile: () => item.kind === "file", isDirectory: () => item.kind === "dir", isSocket: () => item.kind === "socket", isSymbolicLink: () => item.kind === "symlink" }; },
    async realpath(path) { const item = entries.get(path); if (!item) throw error("ENOENT"); return item.realpath ?? path; },
    async readdir(path) { if (entries.get(path)?.kind !== "dir") throw error("ENOENT"); return [...entries.keys()].filter((item) => item.startsWith(`${path}/`) && !item.slice(path.length + 1).includes("/")).map((item) => item.slice(path.length + 1)); },
    async mkdir(path, options) { if (entries.has(path)) throw error("EEXIST"); entries.set(path, { kind: "dir", uid, mode: options.mode }); },
    async open(path, flags, mode) {
      if (flags === "wx") { if (entries.has(path)) throw error("EEXIST"); entries.set(path, { kind: "file", bytes: "", uid, mode }); }
      else if (flags !== "r" || entries.get(path)?.kind !== "dir") throw error("ENOENT");
      return { async writeFile(bytes) { entries.get(path).bytes = bytes; }, async sync() {}, async close() {} };
    },
    async link(source, target) { if (entries.has(target)) throw error("EEXIST"); const item = entries.get(source); if (!item) throw error("ENOENT"); entries.set(target, { ...item }); },
    async unlink(path) { if (!entries.delete(path)) throw error("ENOENT"); },
    async readFile(path) { const item = entries.get(path); if (!item) throw error("ENOENT"); return item.bytes; },
  };
}

test("revision-addressed delivery authority is pure exact frozen and rejects every non-canonical path", async () => {
  const revision = "1a".repeat(20);
  const authority = deliveryAuthorityForRevision(revision);
  assert.equal(Object.isFrozen(authority), true);
  assert.deepEqual(authority, {
    implementationRevision: revision,
    authority: `blog-x-v1.1-local-delivery-${revision}`,
    evidenceDirectory: "ops/local-deliveries",
    evidencePath: `ops/local-deliveries/${revision}.json`,
    claimRoot: "/private/tmp/blog-x-refresh-attempts-v1.1",
    claimPath: `/private/tmp/blog-x-refresh-attempts-v1.1/${revision}.json`,
    failurePath: `/private/tmp/blog-x-refresh-attempts-v1.1/${revision}.failure.json`,
  });
  assert.equal(LOCAL_DELIVERY_EVIDENCE_DIRECTORY, "ops/local-deliveries");
  assert.equal(LOCAL_DELIVERY_CLAIM_ROOT, "/private/tmp/blog-x-refresh-attempts-v1.1");
  assert.equal(parseRevisionAddressedEvidencePath(authority.evidencePath), revision);
  for (const invalid of [
    "ops/v1.1-local-delivery-evidence.json",
    "ops/v1.1-local-delivery-evidence.successor-2.json",
    `/virtual-workspace/${authority.evidencePath}`,
    `./${authority.evidencePath}`,
    `ops/local-deliveries/../${revision}.json`,
    `ops\\local-deliveries\\${revision}.json`,
    `ops/local-deliveries/${revision.toUpperCase()}.json`,
    `ops/local-deliveries/${revision.slice(0, 12)}.json`,
    `ops/local-deliveries/${revision}.json.bak`,
    `ops/local-deliveries/${revision}/receipt.json`,
  ]) assert.throws(() => parseRevisionAddressedEvidencePath(invalid), /revision-addressed|evidence path|full SHA/i, invalid);
  for (const invalid of [revision.toUpperCase(), revision.slice(0, 12), `${revision}/x`, "", null]) {
    assert.throws(() => deliveryAuthorityForRevision(invalid), /revision|full SHA/i, String(invalid));
  }
});

test("both numbered local-delivery receipts remain immutable history", async () => {
  const receipts = [
    ["ops/v1.1-local-delivery-evidence.json", "9a9af65bafabbf94c097525fccba62d3c615d0544ebb127a42f9297efb9303cb"],
    ["ops/v1.1-local-delivery-evidence.successor-2.json", "f10b124b5fba45b7f7dee863db4277259c4b8529cd6c612c31801d8fb5776049"],
  ];
  for (const [path, expected] of receipts) {
    assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), expected, path);
    assert.throws(() => parseRevisionAddressedEvidencePath(path), /revision-addressed|evidence path/i, path);
  }
});

function atomicFaultFs(base, artifact, site) {
  let active = false; let fired = false; let directorySequence = 0; let cleanup = false;
  const fault = () => { fired = true; throw Object.assign(new Error(`${artifact}:${site}`), { code: "EIO" }); };
  const matches = (path) => artifact === "evidence" ? path.includes("/ops/local-deliveries/") && path.includes(".json")
    : artifact === "failure-report" ? path.includes(".failure.json")
      : path.includes("blog-x-refresh-attempts") && path.includes(".json") && !path.includes(".failure.json");
  const maybe = (name) => { if (!fired && site === name) fault(); };
  return {
    entries: base.entries,
    async lstat(path) {
      const result = await base.lstat(path);
      if (active && matches(path) && !path.endsWith(".tmp") && ["final_validation", "cleanup_unlink", "cleanup_sync"].includes(site) && !cleanup) { cleanup = true; fault(); }
      return result;
    },
    realpath: (...args) => base.realpath(...args), readdir: (...args) => base.readdir(...args), mkdir: (...args) => base.mkdir(...args), readFile: (...args) => base.readFile(...args),
    async open(path, flags, mode) {
      if (flags === "wx" && matches(path)) { active = true; maybe("temp_open"); }
      if (active && flags === "r") { directorySequence += 1; maybe(`directory_open_${directorySequence}`); }
      const handle = await base.open(path, flags, mode);
      if (flags === "wx" && active) return {
        async writeFile(...args) { maybe("write"); return handle.writeFile(...args); },
        async sync(...args) { maybe("file_sync"); return handle.sync(...args); },
        async close(...args) { maybe("file_close"); return handle.close(...args); },
      };
      if (flags === "r" && active) { const sequence = directorySequence; return {
        async sync(...args) { if (cleanup && site === "cleanup_sync") fault(); maybe(`directory_sync_${sequence}`); return handle.sync(...args); },
        async close(...args) { maybe(`directory_close_${sequence}`); return handle.close(...args); },
      }; }
      return handle;
    },
    async link(source, target) { if (matches(target)) { active = true; maybe("link"); } return base.link(source, target); },
    async unlink(path) {
      if (active && cleanup && site === "cleanup_unlink" && matches(path) && !path.endsWith(".tmp")) fault();
      if (active && path.endsWith(".tmp")) maybe("temp_unlink");
      return base.unlink(path);
    },
  };
}

function withdrawalFaultFs(base, site) {
  const evidencePath = `/virtual-workspace/${TEST_EVIDENCE_PATH}`;
  const evidenceParent = "/virtual-workspace/ops/local-deliveries";
  let armed = false;
  let fired = false;
  const fault = () => {
    fired = true;
    throw Object.assign(new Error(`evidence withdrawal ${site} fault`), { code: "EIO" });
  };
  return {
    entries: base.entries,
    arm() { armed = true; },
    async lstat(path) { if (armed && !fired && site === "lstat" && path === evidencePath) fault(); return base.lstat(path); },
    async realpath(path) { if (armed && !fired && site === "realpath" && path === evidencePath) fault(); return base.realpath(path); },
    readdir: (...args) => base.readdir(...args),
    mkdir: (...args) => base.mkdir(...args),
    readFile: (...args) => base.readFile(...args),
    link: (...args) => base.link(...args),
    async unlink(path) { if (armed && !fired && site === "unlink" && path === evidencePath) fault(); return base.unlink(path); },
    async open(path, flags, mode) {
      const handle = await base.open(path, flags, mode);
      if (armed && !fired && site === "directory_sync" && path === evidenceParent && flags === "r") {
        return { ...handle, async sync() { fault(); } };
      }
      return handle;
    },
  };
}

test("seed relocation computes both pnpm paths with exact argv and preserves a versioned store", async (t) => {
  const { root, source, neutral } = await fixtureStore(t);
  const runner = fakeRunner([source, neutral]);

  const result = await prepareSeedStore({ cwd: root, run: runner.run, neutralRoot: join(root, "pnpm-store"), refreshWorkspace: join(root, "refresh-workspace") });

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
  const result = await prepareSeedStore({ cwd: root, run: runner.run, neutralRoot: join(root, "pnpm-store"), refreshWorkspace: join(root, "refresh-workspace") });
  assert.equal(result.removedWorkspace, true);
  await assert.rejects(readFile(join(root, "workspace", "marker")));
  assert.equal((await readFile(join(neutral, "files", "package.tgz"), "utf8")), "seed-package");
});

test("seed relocation reuses an already-neutral nonempty store without deleting or copying it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "blog-x-refresh-neutral-seed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const neutral = join(root, "pnpm-store", "v11");
  const refreshWorkspace = join(root, "refresh-workspace");
  await mkdir(join(neutral, "files"), { recursive: true });
  await writeFile(join(neutral, "files", "package.tgz"), "seed-package");
  await mkdir(refreshWorkspace, { recursive: true });
  await writeFile(join(refreshWorkspace, "stale-marker"), "stale-workspace");
  const runner = fakeRunner([neutral, neutral]);
  let copied = false;

  const result = await prepareSeedStore({
    cwd: refreshWorkspace,
    run: runner.run,
    copy: async () => { copied = true; },
    neutralRoot: join(root, "pnpm-store"),
    refreshWorkspace,
  });

  assert.equal(result.alreadyNeutral, true);
  assert.equal(copied, false);
  assert.equal(await readFile(join(neutral, "files", "package.tgz"), "utf8"), "seed-package");
  await assert.rejects(readFile(join(refreshWorkspace, "stale-marker")));
});

test("seed relocation reuses the exact nonempty neutral store after the original source was removed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "blog-x-refresh-relocated-seed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const missingSource = join(root, "root-store", "v11");
  const neutral = join(root, "pnpm-store", "v11");
  const refreshWorkspace = join(root, "refresh-workspace");
  await mkdir(join(neutral, "files"), { recursive: true });
  await writeFile(join(neutral, "files", "package.tgz"), "seed-package");
  await mkdir(refreshWorkspace, { recursive: true });
  const runner = fakeRunner([missingSource, neutral]);
  let copied = false;

  const result = await prepareSeedStore({
    cwd: refreshWorkspace,
    run: runner.run,
    copy: async () => { copied = true; },
    neutralRoot: join(root, "pnpm-store"),
    refreshWorkspace,
  });

  assert.equal(result.alreadyNeutral, true);
  assert.equal(copied, false);
  assert.equal(await readFile(join(neutral, "files", "package.tgz"), "utf8"), "seed-package");

  const absentRunner = fakeRunner([join(root, "missing-source", "v11"), join(root, "missing-neutral", "v11")]);
  await assert.rejects(prepareSeedStore({
    cwd: refreshWorkspace,
    run: absentRunner.run,
    neutralRoot: join(root, "missing-neutral"),
    refreshWorkspace,
  }), /store.*exist/i);
});

test("unsafe, equal, root, unversioned and flattened store paths fail before deletion", async (t) => {
  const { root, source, neutral } = await fixtureStore(t);
  for (const paths of [
    { sourceStore: "/", neutralStore: neutral },
    { sourceStore: source, neutralStore: source },
    { sourceStore: source, neutralStore: join(root, "pnpm-store") },
    { sourceStore: join(root, "other", "v9"), neutralStore: neutral },
  ]) {
    assert.throws(() => validateStorePaths({ ...paths, neutralRoot: join(root, "pnpm-store") }), /store|version|distinct|source/i);
  }
  const runner = fakeRunner([source, join(root, "pnpm-store", "v10")]);
  await assert.rejects(prepareSeedStore({ cwd: root, run: runner.run, copy: async () => undefined, neutralRoot: join(root, "pnpm-store") }), /manifest/i);
  assert.equal(await readFile(join(source, "files", "package.tgz"), "utf8"), "seed-package");
});

test("refresh plan has one fixed local authority and offline two-image barrier before mutation", () => {
  const plan = createRefreshPlan({ revision: "a".repeat(40), lockSha256: "b".repeat(64), apiSeedId: `sha256:${"c".repeat(64)}`, webSeedId: `sha256:${"d".repeat(64)}` });
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
  assert.deepEqual(plan.phases.slice(plan.phases.indexOf("inspect-target-images"), plan.phases.indexOf("schema-verify") + 1), ["inspect-target-images", "accept-v1.1", "migrate", "schema-verify"]);
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
  assert.deepEqual(events, ["preflight", "seed-prerequisites", "build-api", "build-web", "inspect-target-images", "accept-v1.1", "migrate", "schema-verify", "cutover-api-web", "routes", "rollback-api-web", "verify-rollback"]);
  assert.equal(events.includes("write-evidence"), false);
  assert.equal(events.some((event) => /postgres|volume|down/.test(event)), false);
});

test("successful refresh writes sanitized evidence only after route and BLOCKED checks", async () => {
  const events = [];
  const evidence = await runLocalRefresh({ adapter: { async execute(step) { events.push(step); } } });
  assert.deepEqual(events, ["preflight", "seed-prerequisites", "build-api", "build-web", "inspect-target-images", "accept-v1.1", "migrate", "schema-verify", "cutover-api-web", "routes", "release-blocked", "write-evidence"]);
  assert.equal(evidence.releaseState, "BLOCKED");
  assert.equal("credentials" in evidence, false);
});

test("evidence verification is read-only and refuses malformed or non-BLOCKED records", async () => {
  const fs = memoryArtifactFs();
  const path = `/virtual-workspace/${TEST_EVIDENCE_PATH}`;
  fs.entries.set(path, { kind: "file", bytes: JSON.stringify({ format: "blog-x-v1.1-local-delivery-evidence", version: 1, implementationRevision: "short", lockfileSha256: "b".repeat(64), releaseState: "READY" }), uid: TEST_UID, mode: 0o600 });
  const before = await fs.readFile(path);
  await assert.rejects(testRuntime(fs).verifyEvidence(path), /evidence/i);
  assert.equal(await fs.readFile(path), before);
});

test("source contracts require neutral stores, offline frozen installs and sanitized refresh workspaces", async () => {
  for (const file of ["apps/api/Dockerfile.refresh", "apps/web/Dockerfile.refresh"]) {
    const dockerfile = await readFile(file, "utf8");
    assert.match(dockerfile, /refresh-seed-store\.mjs/);
    assert.match(dockerfile, /--store-dir=\/pnpm-store --offline --frozen-lockfile/);
    assert.match(dockerfile, /\/refresh-workspace/);
    assert.match(dockerfile, /--network=none/);
  }
  const helper = await readFile("scripts/refresh-seed-store.mjs", "utf8");
  assert.match(helper, /resolve\(cwd, "workspace"\)/);
  const orchestrator = await readFile("scripts/refresh-local.mjs", "utf8");
  assert.match(orchestrator, /createProductionLiveRefreshAdapter/);
  const runtime = await readFile("scripts/refresh-local-runtime-core.mjs", "utf8");
  assert.match(runtime, /--probe-offline-builds/);
  assert.match(runtime, /docker-compose/);
  assert.match(runtime, /--network=none/);
  assert.match(runtime, /--pull=false/);
  assert.match(runtime, /--no-build/);
  assert.match(runtime, /--no-deps/);
  assert.match(runtime, /pg_dump[\s\S]*--inserts/);
  assert.doesNotMatch(runtime, /\b(?:ssh|scp|curl)\b/);
});

test("runRefreshCli consumes the raw test runtime only after publishing an absent claim", async () => {
  const fixture = liveFixture();
  const result = await fixture.runtime.runCli();
  assert.equal(result.implementationRevision, fixture.revision);
  assert.match((await fixture.runtime.inspectClaim(fixture.revision)).sha256, /^[a-f0-9]{64}$/);
  assert.ok(fixture.calls.some((call) => call.command === "docker" && call.args[0] === "context"));
  await assert.rejects(fixture.runtime.runCli({ argv: ["--verify-evidence=ops/phase6-local-refresh-evidence.json"] }), /revision-addressed|evidence path/i);
  await assert.rejects(fixture.runtime.runCli({ argv: ["--probe-offline-builds", "extra"] }), /probe option.*exact/i);
});

test("Docker capacity preflight is retryable, exact, claim-free, and rejects insufficient resources", async () => {
  assert.deepEqual(assessDockerBuildCapacity({
    apiImageBytes: String(5n * 1024n ** 3n),
    webImageBytes: String(6n * 1024n ** 3n),
    availableBytes: String(14n * 1024n ** 3n),
    availableInodes: "200000",
  }), {
    requiredBytes: String(13n * 1024n ** 3n),
    availableBytes: String(14n * 1024n ** 3n),
    availableInodes: "200000",
  });
  assert.throws(() => assessDockerBuildCapacity({ apiImageBytes: "1", webImageBytes: "1", availableBytes: "2", availableInodes: "200000" }), /free bytes/i);
  assert.throws(() => assessDockerBuildCapacity({ apiImageBytes: "1", webImageBytes: "1", availableBytes: String(3n * 1024n ** 3n), availableInodes: "199999" }), /inodes/i);
  for (const invalid of ["-1", "1.5", "01", "", "1e9"]) assert.throws(() => assessDockerBuildCapacity({ apiImageBytes: invalid, webImageBytes: "1", availableBytes: String(3n * 1024n ** 3n), availableInodes: "200000" }), /invalid/i);

  const fixture = liveFixture();
  const adapterConstructions = fixture.runtime.adapterConstructionCount();
  const passed = [];
  await fixture.runtime.runCli({ argv: ["--check-docker-capacity"], output: { write(value) { passed.push(value); } } });
  assert.equal(passed.join(""), "LOCAL DOCKER CAPACITY PASSED required_bytes=1 available_bytes=2 available_inodes=200000\n");
  await fixture.runtime.createAttemptStore().assertAbsent(fixture.revision);
  assert.equal(fixture.runtime.adapterConstructionCount(), adapterConstructions);

  const failed = [];
  await assert.rejects(fixture.runtime.runCli({
    argv: ["--check-docker-capacity"],
    output: { write(value) { failed.push(value); } },
    checkDockerCapacity: async () => { throw new Error("raw Docker path and output"); },
  }), /capacity preflight/i);
  assert.match(failed.join(""), /LOCAL DOCKER CAPACITY FAILED/);
  assert.doesNotMatch(failed.join(""), /raw Docker path|\/Users\//);
  await fixture.runtime.createAttemptStore().assertAbsent(fixture.revision);
  await assert.rejects(fixture.runtime.runCli({ argv: ["--check-docker-capacity", "extra"] }), /option is not exact/i);
});

test("branch-qualified source authority rejects dirty, detached and malformed refs before adapter mutation", async () => {
  const revision = "c".repeat(40);
  for (const [status, ref] of [[" M package.json\n", "refs/heads/dev\n"], ["", ""], ["", "refs/tags/v1\n"], ["", "refs/heads/bad branch\n"]]) {
    const runtime = createRefreshTestRuntime({
      fs: memoryArtifactFs(), randomHex: () => "1".repeat(24), fetch: async () => { throw new Error("unused"); }, clock: () => undefined,
      processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "status" ? status : command === "git" && args[0] === "symbolic-ref" ? ref : command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }),
    });
    await assert.rejects(runtime.runCli(), /source_authority/i);
    assert.equal(runtime.calls.some((call) => call.command === "docker"), false);
  }
  assert.equal(HISTORICAL_LOCAL_DELIVERY_EVIDENCE_PATH, "ops/v1.1-local-delivery-evidence.json");
  assert.equal(HISTORICAL_SUCCESSOR_2_LOCAL_DELIVERY_EVIDENCE_PATH, "ops/v1.1-local-delivery-evidence.successor-2.json");
  assert.equal(HISTORICAL_CLAIM_ROOT, "/private/tmp/blog-x-refresh-attempts");
  assert.equal(HISTORICAL_SUCCESSOR_2_CLAIM_ROOT, "/private/tmp/blog-x-refresh-attempts-v1.1-successor-2");
  assert.notEqual(LOCAL_DELIVERY_CLAIM_ROOT, HISTORICAL_CLAIM_ROOT);
});

test("successor delivery authority preserves the committed v1.1 receipt as immutable history", async () => {
  const historicalBytes = await readFile(HISTORICAL_LOCAL_DELIVERY_EVIDENCE_PATH, "utf8");
  const historical = JSON.parse(historicalBytes);
  assert.equal(historical.implementationRevision, "4414710b605ecd8a770a1c3a60afef479c9b4eb7");
  assert.equal(historical.releaseState, "BLOCKED");
  assert.equal(Object.hasOwn(historical.attemptClaim, "authority"), false);
  const fs = memoryArtifactFs();
  fs.entries.set(`/virtual-workspace/${HISTORICAL_LOCAL_DELIVERY_EVIDENCE_PATH}`, { kind: "file", bytes: historicalBytes, uid: TEST_UID, mode: 0o600 });
  await assert.rejects(testRuntime(fs).verifyEvidence(`/virtual-workspace/${HISTORICAL_LOCAL_DELIVERY_EVIDENCE_PATH}`), /revision-addressed|evidence path/i);
});

test("attempt claims are canonical, exclusive, revision-bound, and leave second cli calls before adapter construction", async () => {
  const { fs: storeFs, store } = fakeClaimStore();
  const revision = "f".repeat(40);
  const first = await store.claimRefreshAttempt(revision);
  const derived = deliveryAuthorityForRevision(revision);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await store.assertPresent(revision)).sha256, first.sha256);
  assert.deepEqual(JSON.parse(first.bytes.trim()), {
    format: "blog-x-local-refresh-attempt",
    version: 3,
    authority: derived.authority,
    evidencePath: derived.evidencePath,
    implementationRevision: revision,
  });
  assert.equal(first.authority, derived.authority);
  assert.equal(first.evidencePath, derived.evidencePath);
  await assert.rejects(store.claimRefreshAttempt(revision), /claimed|exists/i);
  const runtime = createRefreshTestRuntime({ fs: storeFs, randomHex: () => "2".repeat(24), fetch: async () => { throw new Error("unused"); }, clock: () => undefined, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "symbolic-ref" ? "refs/heads/dev\n" : command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
  await assert.rejects(runtime.runCli(), /attempt_claim_preflight/i);
  assert.equal(runtime.calls.filter((call) => call.command === "docker").length, 0);
  await assert.rejects(store.claimRefreshAttempt("F".repeat(40)), /revision/i);
  const live = await import("./refresh-local-live.mjs");
  assert.throws(() => live.createProductionRefreshAttemptStore({ root: "/tmp/blog-x-refresh-attempts" }), /argument|sealed|override/i);
});

test("runtime claim attachment recomputes canonical bytes digest and every revision authority field", () => {
  const revision = "3".repeat(40);
  const authority = deliveryAuthorityForRevision(revision);
  const bytes = `${JSON.stringify({
    format: "blog-x-local-refresh-attempt",
    version: 3,
    authority: authority.authority,
    evidencePath: authority.evidencePath,
    implementationRevision: revision,
  })}\n`;
  const canonical = {
    implementationRevision: revision,
    authority: authority.authority,
    evidencePath: authority.evidencePath,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const adapter = () => testRuntime(memoryArtifactFs()).createAdapter();
  assert.doesNotThrow(() => adapter().attachAttemptClaim(canonical));
  for (const forged of [
    { ...canonical, implementationRevision: "4".repeat(40) },
    { ...canonical, authority: `${authority.authority}-foreign` },
    { ...canonical, evidencePath: `${authority.evidencePath}.bak` },
    { ...canonical, bytes: `${bytes} ` },
    { ...canonical, sha256: "0".repeat(64) },
  ]) assert.throws(() => adapter().attachAttemptClaim(forged), /claim attachment|canonical|digest|authority/i);
});

test("concurrent fixed-root claims have exactly one winner and retain the canonical final claim", async () => {
  const fs = memoryClaimFs(); let token = 0;
  const store = testRuntime(fs, () => `${++token}`.padStart(24, "0")).createAttemptStore();
  const revision = "d".repeat(40);
  const results = await Promise.allSettled([store.claimRefreshAttempt(revision), store.claimRefreshAttempt(revision)]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
  assert.equal((await store.assertPresent(revision)).sha256, results.find((item) => item.status === "fulfilled").value.sha256);
});

test("live command policy permits only fixed local argv", async () => {
  assert.doesNotThrow(() => assertAllowedRefreshCommand("docker", ["build", "--network=none", "--pull=false", "--file", "apps/api/Dockerfile.refresh", "--tag", "blog-x-api-local:aaaaaaaaaaaa", "--build-arg", `SEED_IMAGE=${SHA("c")}`, "--build-arg", `SEED_IMAGE_ID=${SHA("c")}`, "--build-arg", `REFRESH_REVISION=${"a".repeat(40)}`, "--build-arg", `LOCKFILE_SHA256=${"b".repeat(64)}`, "--build-arg", "PUBLIC_ORIGIN=http://127.0.0.1:3100", "."]));
  assert.doesNotThrow(() => assertAllowedRefreshCommand("node", ["scripts/local-delivery-acceptance.mjs"]));
  for (const args of [["scripts/local-delivery-acceptance.mjs", "--partial"], ["./scripts/local-delivery-acceptance.mjs"], ["scripts/local-delivery-acceptance.mjs", ""]]) {
    assert.throws(() => assertAllowedRefreshCommand("node", args), /allowlisted|exact|argv/i);
  }
  for (const [command, args] of [["docker-compose", ["-p", "other", "down"]], ["docker", ["build", "--network=host"]], ["ssh", ["root@example"]]]) {
    assert.throws(() => assertAllowedRefreshCommand(command, args), /not allowlisted|allowlisted shape|authority|network/i);
  }
});

const SHA = (letter) => `sha256:${letter.repeat(64)}`;
const acceptanceCounts = { tests: 24, passed: 24, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
const acceptanceManifestSha256 = createHash("sha256").update(JSON.stringify(PACKAGE_TEST_INVENTORY)).digest("hex");
const generatedIntegrationInventory = PACKAGE_TEST_INVENTORY.filter((entry) => entry.scope === "integration" && entry.fixtureOwner !== "phase7-browser").map((entry) => entry.path).sort();
const phase7BrowserInventory = PACKAGE_TEST_INVENTORY.filter((entry) => entry.fixtureOwner === "phase7-browser").map((entry) => entry.path).sort();
const acceptanceBody = {
  format: "blog-x-v1.1-local-delivery-acceptance",
  version: 2,
  manifestSha256: acceptanceManifestSha256,
  inventory: [...generatedIntegrationInventory, ...phase7BrowserInventory].sort(),
  generatedIntegration: { runs: 1, manifestSha256: acceptanceManifestSha256, inventory: generatedIntegrationInventory, resultSha256: "1".repeat(64), outputSha256: "2".repeat(64), counts: { ...acceptanceCounts, tests: 18, passed: 18 }, cleanupAcknowledged: true },
  phase7Browser: { runs: 1, manifestSha256: acceptanceManifestSha256, inventory: phase7BrowserInventory, resultSha256: "3".repeat(64), outputSha256: "4".repeat(64), counts: { ...acceptanceCounts, tests: 6, passed: 6 }, cleanupAcknowledged: true },
  counts: acceptanceCounts,
  releaseState: "BLOCKED",
};
const acceptanceRecord = { ...acceptanceBody, resultSha256: createHash("sha256").update(JSON.stringify(acceptanceBody)).digest("hex") };
const acceptanceOutput = `BLOG X V1.1 ACCEPTANCE RESULT ${JSON.stringify(acceptanceRecord)}\n`;
const composeLabels = (service, oneoff = "False") => ({
  "com.docker.compose.project": "blogxlocal",
  "com.docker.compose.service": service,
  "com.docker.compose.oneoff": oneoff,
});
function inspectContainer(service, image = SHA(service[0])) {
  const names = { postgres: "blogxlocal-postgres-1", api: "blogxlocal-api-1", web: "blogxlocal-web-1" };
  const ports = service === "postgres" ? { "5432/tcp": null }
    : service === "api" ? { "3001/tcp": null }
      : { "3100/tcp": [{ HostIp: "127.0.0.1", HostPort: "3100" }] };
  return { Id: service === "web" ? "c".repeat(64) : service === "api" ? "a".repeat(64) : "b".repeat(64), Image: image, Name: `/${names[service]}`, Config: { Image: `blog-x-${service}-local`, Labels: composeLabels(service) }, State: { Health: { Status: "healthy" } }, NetworkSettings: { Ports: ports } };
}
const volumeFixture = (name) => ({ Name: name, Driver: "local", Mountpoint: `/private/var/lib/${name}`, CreatedAt: "2026-08-15T00:00:00Z", Scope: "local", Labels: { "com.docker.compose.project": "blogxlocal" }, Options: null });
const exactRoutes = {
  "/": { status: 200, bodySha256: "1".repeat(64) },
  "/search": { status: 200, bodySha256: "0".repeat(64) },
  "/categories": { status: 200, bodySha256: "2".repeat(64) },
  "/tags": { status: 200, bodySha256: "3".repeat(64) },
  "/archives": { status: 200, bodySha256: "4".repeat(64) },
  "/api/health": { status: 200, body: { ok: true }, bodySha256: "5".repeat(64) },
  "/api/public/search?q=": { status: 200, body: { state: "empty_query", query: "", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] }, bodySha256: "6".repeat(64) },
  "/api/public/articles/phase6-unknown/related": { status: 404, body: { error: "not_found" }, bodySha256: "7".repeat(64) },
};
const rawRouteBodies = {
  "/": "<html>home</html>",
  "/search": "<html>search</html>",
  "/categories": "<html>categories</html>",
  "/tags": "<html>tags</html>",
  "/archives": "<html>archives</html>",
  "/api/health": JSON.stringify({ ok: true }),
  "/api/public/search?q=": JSON.stringify({ state: "empty_query", query: "", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] }),
  "/api/public/articles/phase6-unknown/related": JSON.stringify({ error: "not_found" }),
};
const STALE_SEARCH_BODY = "<html>legacy search route missing</html>";
const STALE_RELATED_BODY = JSON.stringify({ error: "legacy_route_missing" });
const rawDigest = (value) => createHash("sha256").update(value).digest("hex");
const publicListItem = { title: "Public", summary: "Summary", slug: "hello-world", publishedAt: "2026-08-20T00:00:00.000Z", status: "published", category: null, tags: [] };
const publicListBody = JSON.stringify({ page: 1, pageSize: 10, totalItems: 1, totalPages: 1, items: [publicListItem] });
const emptyPublicListBody = JSON.stringify({ page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] });
const verifiedReading = {
  state: "verified", listStatus: 200, listBodySha256: rawDigest(publicListBody), detailStatus: 200,
  detailBodySha256: rawDigest("<html>post</html>"), slugSha256: rawDigest(publicListItem.slug),
};
const emptyReading = { state: "empty_public_set", listStatus: 200, listBodySha256: rawDigest(emptyPublicListBody), detailStatus: null, detailBodySha256: null, slugSha256: null };
const staleRoutes = {
  ...structuredClone(exactRoutes),
  "/api/public/search?q=": { status: 404, bodySha256: rawDigest(STALE_SEARCH_BODY) },
  "/api/public/articles/phase6-unknown/related": { status: 404, body: JSON.parse(STALE_RELATED_BODY), bodySha256: rawDigest(STALE_RELATED_BODY) },
};
const finalRouteResponses = Object.fromEntries(Object.entries(rawRouteBodies).map(([path, body]) => [path, {
  status: path.endsWith("/related") ? 404 : 200,
  body,
  contentType: path.startsWith("/api/") ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
}]));
const staleRouteResponses = {
  ...structuredClone(finalRouteResponses),
  "/api/public/search?q=": { status: 404, body: STALE_SEARCH_BODY, contentType: "text/html; charset=utf-8" },
  "/api/public/articles/phase6-unknown/related": { status: 404, body: STALE_RELATED_BODY, contentType: "application/problem+json; charset=utf-8" },
};
function fakeRouteResponse(url, response) {
  return {
    status: response.status,
    url,
    headers: { get(name) { return name.toLowerCase() === "content-type" ? response.contentType : null; } },
    async text() { return response.body; },
  };
}
function factsFixture({ apiImage = SHA("a"), webImage = SHA("w"), phase1 = "2026-08-15T00:00:00.000Z", routes = exactRoutes, reading = verifiedReading, migrationCount = 8, migrationFingerprint = "fingerprint", schemaRows = 12, schemaSha256 = "2".repeat(64), business = { count: 3, sha256: "a".repeat(64) } } = {}) {
  return {
    containers: [inspectContainer("api", apiImage), inspectContainer("postgres", SHA("p")), inspectContainer("web", webImage)],
    volumes: [volumeFixture("blogxlocal_media-data"), volumeFixture("blogxlocal_postgres-data")],
    business, sequences: { count: 2, sha256: "b".repeat(64) },
    ledger: [{ scope: "phase1", migration_count: migrationCount, migration_fingerprint: migrationFingerprint, applied_at: phase1 }],
    media: { count: 2, bytes: 42, sha256: "c".repeat(64) }, protected: { count: 9, sha256: "d".repeat(64) },
    git: { implementationRevision: "a".repeat(40), clean: true, lockfileSha256: "b".repeat(64), ref: "refs/heads/dev" },
    database: { name: "blog_x", systemIdentifier: "1".repeat(32), schemaSha256, schemaRows },
    seeds: { api: { reference: "blog-x-api-local", inspectedId: SHA("a") }, web: { reference: "blog-x-web-local", inspectedId: SHA("b") } },
    targets: { api: { id: SHA("e"), labelsSha256: "3".repeat(64), filesystemSha256: "4".repeat(64), storeSha256: "5".repeat(64) }, web: { id: SHA("f"), labelsSha256: "6".repeat(64), filesystemSha256: "7".repeat(64), storeSha256: "8".repeat(64) } },
    portOwnerExact: true, routes, reading, releaseState: "BLOCKED",
  };
}

test("representative reading facts prove a hashed public slug or an exact empty public set", () => {
  assert.doesNotThrow(() => assertReadingFact(verifiedReading));
  assert.doesNotThrow(() => assertReadingFact(emptyReading));
  for (const invalid of [
    { ...verifiedReading, rawSlug: publicListItem.slug },
    { ...verifiedReading, detailStatus: 302 },
    { ...emptyReading, totalItems: 0 },
    { ...emptyReading, slugSha256: "1".repeat(64) },
  ]) assert.throws(() => assertReadingFact(invalid), /reading|key|status|slug|empty/i);
  const projection = projectSanitizedFacts(factsFixture());
  assert.deepEqual(projection.reading, verifiedReading);
  assert.doesNotMatch(JSON.stringify(projection), /hello-world/);
});

test("raw Docker Ports:null and exact Compose labels are the only fixed runtime authority", () => {
  const facts = factsFixture();
  assert.doesNotThrow(() => assertFixedRuntimeAuthority(facts));
  for (const mutate of [
    (copy) => { copy.containers[0].NetworkSettings.Ports["3001/tcp"] = [{ HostIp: "0.0.0.0", HostPort: "3001" }]; },
    (copy) => { copy.containers[1].Config.Labels["com.docker.compose.project"] = "other"; },
    (copy) => { copy.containers[2].NetworkSettings.Ports["3101/tcp"] = null; },
  ]) {
    const copy = structuredClone(facts); mutate(copy);
    assert.throws(() => assertFixedRuntimeAuthority(copy), /authority|port|compose/i);
  }
});

test("published 3100 owner must be the sole inspected canonical Web container", () => {
  const containers = factsFixture().containers;
  const owner = { ID: "c".repeat(12), Names: "blogxlocal-web-1", Labels: "com.docker.compose.project=blogxlocal,com.docker.compose.service=web" };
  assert.doesNotThrow(() => assertCanonicalPortOwner(`${JSON.stringify(owner)}\n`, containers));
  for (const output of ["", `${JSON.stringify(owner)}\n${JSON.stringify(owner)}\n`, `${JSON.stringify({ ...owner, ID: "foreign" })}\n`, `${JSON.stringify({ ...owner, Names: "foreign-web" })}\n`, `${JSON.stringify({ ...owner, Labels: "com.docker.compose.project=other,com.docker.compose.service=web" })}\n`, "not-json\n"]) {
    assert.throws(() => assertCanonicalPortOwner(output, containers), /port|owner|JSON|canonical|identity/i);
  }
  assert.doesNotThrow(() => assertAllowedRefreshCommand("docker", ["ps", "--filter", "publish=3100", "--format", "{{json .}}"]));
  assert.throws(() => assertAllowedRefreshCommand("docker", ["ps", "--format", "{{json .}}", "--filter", "publish=3100"]), /allowlisted|argv|exact/i);
});

test("postMigration permits only phase1 timestamp advance and later stages preserve all persistence digests", () => {
  const preflight = factsFixture();
  const postMigration = factsFixture({ phase1: "2026-08-16T00:00:00.000Z" });
  assert.doesNotThrow(() => assertPersistenceTransition(preflight, postMigration, { stage: "postMigration" }));
  assert.throws(() => assertPersistenceTransition(preflight, factsFixture(), { stage: "postMigration" }), /phase1|advance/i);
  const drift = structuredClone(postMigration); drift.media.sha256 = "e".repeat(64);
  assert.throws(() => assertPersistenceTransition(postMigration, drift, { stage: "postCutover", targetImageIds: { api: SHA("n"), web: SHA("x") } }), /media|persistence/i);

  const version7 = factsFixture({ migrationCount: 7, migrationFingerprint: "version-7", schemaRows: 11, schemaSha256: "1".repeat(64) });
  const version8 = factsFixture({ phase1: "2026-08-16T00:00:00.000Z", migrationCount: 8, migrationFingerprint: "version-8", schemaRows: 12, schemaSha256: "2".repeat(64) });
  assert.doesNotThrow(() => assertPersistenceTransition(version7, version8, { stage: "postMigration" }));
  const version6 = factsFixture({ phase1: "2026-08-16T00:00:00.000Z", migrationCount: 6, migrationFingerprint: "version-6", schemaRows: 12, schemaSha256: "2".repeat(64) });
  assert.throws(() => assertPersistenceTransition(version7, version6, { stage: "postMigration" }), /migration count|backward/i);
  const dataDrift = structuredClone(version8); dataDrift.business.sha256 = "9".repeat(64);
  assert.throws(() => assertPersistenceTransition(version7, dataDrift, { stage: "postMigration" }), /business persistence/i);
});

test("route observations stay exact before cutover and rollback requires an explicit preflight baseline", () => {
  const preflight = factsFixture({ routes: staleRoutes });
  const postMigration = factsFixture({ phase1: "2026-08-16T00:00:00.000Z", routes: structuredClone(staleRoutes) });
  assert.doesNotThrow(() => assertPersistenceTransition(preflight, postMigration, { stage: "postMigration" }));

  const drift = structuredClone(postMigration);
  drift.routes["/api/public/search?q="].bodySha256 = "9".repeat(64);
  assert.throws(() => assertPersistenceTransition(preflight, drift, { stage: "postMigration" }), /route|observation/i);

  const rollback = factsFixture({ phase1: "2026-08-16T00:00:00.000Z", routes: structuredClone(staleRoutes) });
  assert.throws(() => assertPersistenceTransition(postMigration, rollback, { stage: "rollback", oldImageIds: { api: SHA("a"), web: SHA("w") } }), /preflight|route|baseline/i);
  assert.doesNotThrow(() => assertPersistenceTransition(postMigration, rollback, { stage: "rollback", oldImageIds: { api: SHA("a"), web: SHA("w") }, preflightRoutes: staleRoutes }));

  const staleCutover = factsFixture({ apiImage: SHA("n"), webImage: SHA("x"), phase1: "2026-08-16T00:00:00.000Z", routes: staleRoutes });
  assert.throws(() => assertPersistenceTransition(postMigration, staleCutover, { stage: "postCutover", targetImageIds: { api: SHA("n"), web: SHA("x") } }), /route|contract|search/i);
});

test("sanitized v4 fact projection contains digests and counts but no raw rows, paths, mounts, env or commands", () => {
  const projection = projectSanitizedFacts(factsFixture());
  const bytes = JSON.stringify(projection);
  assert.deepEqual(Object.keys(projection).sort(), ["business", "containers", "database", "git", "ledger", "media", "protected", "reading", "releaseState", "routes", "seeds", "sequences", "targets", "topology", "volumes"].sort());
  assert.doesNotMatch(bytes, /Mountpoint|relativePath|migration_fingerprint|applied_at|environment|command|private\/var/i);
});

test("observed route projection is deterministic nullable and excludes raw stale bodies", () => {
  const projection = projectSanitizedFacts(factsFixture({ routes: staleRoutes }), { routeContract: "observed" });
  assert.deepEqual(Object.keys(projection.routes["/api/public/search?q="]).sort(), ["bodySha256", "contractSha256", "status"]);
  assert.equal(projection.routes["/api/public/search?q="].contractSha256, null);
  assert.match(projection.routes["/api/public/articles/phase6-unknown/related"].contractSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(projection.routes["/archives"]).sort(), ["bodySha256", "status"]);
  const bytes = JSON.stringify(projection);
  assert.doesNotMatch(bytes, /legacy search route missing|legacy_route_missing|content-type|text\/html|problem\+json/i);
  assert.throws(() => projectSanitizedFacts(factsFixture({ routes: staleRoutes })), /route|contract|search/i);
  assert.throws(() => projectSanitizedFacts(factsFixture(), { routeContract: "unknown" }), /route|mode|contract/i);
});

test("route facts and sanitized projections require one plural archives authority", () => {
  const singularArchive = "/archives".slice(0, -1);
  assert.doesNotThrow(() => assertRouteFacts(exactRoutes));

  const singular = structuredClone(exactRoutes);
  singular[singularArchive] = singular["/archives"];
  delete singular["/archives"];
  assert.throws(() => assertRouteFacts(singular), /route|key|archive/i);

  const dual = structuredClone(exactRoutes);
  dual[singularArchive] = structuredClone(dual["/archives"]);
  assert.throws(() => assertRouteFacts(dual), /route|key|archive/i);

  const projection = projectSanitizedFacts(factsFixture());
  assert.equal(Object.hasOwn(projection.routes, "/archives"), true);
  assert.equal(Object.hasOwn(projection.routes, singularArchive), false);
});

test("command policy is exact-token and rejects extra, reordered, alternate authority and mutable rollback refs", () => {
  const revision = "a".repeat(40);
  const valid = ["docker", ["build", "--network=none", "--pull=false", "--file", "apps/api/Dockerfile.refresh", "--tag", `blog-x-api-local:${revision.slice(0, 12)}`, "--build-arg", `SEED_IMAGE=${SHA("c")}`, "--build-arg", `SEED_IMAGE_ID=${SHA("c")}`, "--build-arg", `REFRESH_REVISION=${revision}`, "--build-arg", `LOCKFILE_SHA256=${"b".repeat(64)}`, "--build-arg", "PUBLIC_ORIGIN=http://127.0.0.1:3100", "."]];
  assert.doesNotThrow(() => assertAllowedRefreshCommand(...valid));
  for (const args of [[...valid[1], "extra"], ["build", "--pull=false", "--network=none", ...valid[1].slice(3)], valid[1].map((value) => value === "PUBLIC_ORIGIN=http://127.0.0.1:3100" ? "PUBLIC_ORIGIN=http://0.0.0.0:3100" : value)]) {
    assert.throws(() => assertAllowedRefreshCommand("docker", args), /allowlisted|exact|argv/i);
  }
  const range = `${"a".repeat(40)}..${"c".repeat(40)}`;
  const history = ["log", "--format=", "--name-only", "-z", "-m", "--no-renames", range, "--"];
  assert.doesNotThrow(() => assertAllowedRefreshCommand("git", history));
  for (const args of [history.filter((value) => value !== "-m"), history.filter((value) => value !== "--no-renames"), history.filter((value) => value !== "-z"), [...history, "extra"], history.map((value) => value === range ? "abc..def" : value)]) {
    assert.throws(() => assertAllowedRefreshCommand("git", args), /allowlisted|exact|argv/i);
  }
});

test("collector uses fake argv/database/media/history adapters and rejects malformed route observations", async () => {
  const fixture = factsFixture();
  const calls = [];
  const collected = await collectRefreshFacts({
    sources: {
      async composeAuthority() { calls.push("compose"); return { services: ["api", "postgres", "web"], ps: ["api", "postgres", "web"] }; },
      async containers() { calls.push("containers"); return fixture.containers; },
      async portOwner() { calls.push("port-owner"); return true; },
      async volumes() { calls.push("volumes"); return fixture.volumes; },
      async business() { calls.push("database"); return fixture.business; },
      async sequences() { return fixture.sequences; }, async ledger() { return fixture.ledger; },
      async media() { calls.push("media"); return fixture.media; }, async protected() { calls.push("history"); return fixture.protected; },
      async routes() { return fixture.routes; }, async reading() { return fixture.reading; }, async releaseState() { return "BLOCKED"; },
      async git() { return fixture.git; }, async database() { return fixture.database; }, async seeds() { return fixture.seeds; }, async targets() { return fixture.targets; },
    },
  });
  assert.deepEqual(calls, ["compose", "containers", "volumes", "database", "media", "history", "port-owner"]);
  assertFixedRuntimeAuthority(collected);
  const bad = structuredClone(fixture.routes); bad["/api/public/search?q="].status = 302;
  await assert.rejects(collectRefreshFacts({ sources: { composeAuthority: async () => ({ services: ["api", "postgres", "web"], ps: ["api", "postgres", "web"] }), containers: async () => fixture.containers, portOwner: async () => true, volumes: async () => fixture.volumes, business: async () => fixture.business, sequences: async () => fixture.sequences, ledger: async () => fixture.ledger, media: async () => fixture.media, protected: async () => fixture.protected, routes: async () => bad, reading: async () => fixture.reading, releaseState: async () => "BLOCKED", git: async () => fixture.git, database: async () => fixture.database, seeds: async () => fixture.seeds, targets: async () => fixture.targets } }), /route|search|status|redirect|observation/i);
});

const COMPOSE_V5_PS_RECORDS = [
  { ID: "api-id", Name: "blogxlocal-api-1", Project: "blogxlocal", Service: "api", State: "running", Health: "healthy", ExitCode: 0, Image: "blog-x-api-local", Publishers: [] },
  { ID: "postgres-id", Name: "blogxlocal-postgres-1", Project: "blogxlocal", Service: "postgres", State: "running", Health: "healthy", ExitCode: 0, Image: "postgres:18", Publishers: [] },
  { ID: "web-id", Name: "blogxlocal-web-1", Project: "blogxlocal", Service: "web", State: "running", Health: "healthy", ExitCode: 0, Image: "blog-x-web-local", Publishers: [{ URL: "127.0.0.1", TargetPort: 3100, PublishedPort: 3100, Protocol: "tcp" }] },
];
const COMPOSE_V5_PS_NDJSON = `${COMPOSE_V5_PS_RECORDS.map((record) => JSON.stringify(record)).join("\n")}\n`;
const COMPOSE_PS_ARGV = ["-p", "blogxlocal", "-f", "compose.yaml", "ps", "--all", "--format", "json"];

function composeAuthorityFixture(psStdout) {
  const runtime = testRuntime(memoryArtifactFs(), undefined, async (command, args) => {
    if (command !== "docker-compose") throw new Error(`unexpected command ${command}`);
    if (args.at(4) === "config") return { stdout: "api\npostgres\nweb\n" };
    if (args.at(4) === "ps") return { stdout: psStdout };
    throw new Error(`unexpected Compose argv ${args.join(" ")}`);
  });
  return { runtime, sources: runtime.createFactSources() };
}

test("Compose ps authority accepts legacy JSON arrays and sanitized v5 NDJSON records", async () => {
  for (const psStdout of [JSON.stringify(COMPOSE_V5_PS_RECORDS), JSON.stringify(COMPOSE_V5_PS_RECORDS, null, 2), COMPOSE_V5_PS_NDJSON, COMPOSE_V5_PS_NDJSON.replaceAll("\n", "\r\n")]) {
    const { runtime, sources } = composeAuthorityFixture(psStdout);
    assert.deepEqual(await sources.composeAuthority(), { services: ["api", "postgres", "web"], ps: ["api", "postgres", "web"] });
    assert.deepEqual(runtime.calls.map(({ command, args }) => [command, args]), [
      ["docker-compose", ["-p", "blogxlocal", "-f", "compose.yaml", "config", "--services"]],
      ["docker-compose", COMPOSE_PS_ARGV],
    ]);
  }
  assert.equal(COMPOSE_V5_PS_RECORDS[2].Publishers[0].TargetPort, 3100);
  assert.doesNotMatch(COMPOSE_V5_PS_NDJSON, /Mountpoint|Source|postgres:\/\/|password|credential|\/Users\/|private\/var/i);
});

test("Compose ps authority rejects malformed mixed blank and non-object encodings", async () => {
  const first = JSON.stringify(COMPOSE_V5_PS_RECORDS[0]); const second = JSON.stringify(COMPOSE_V5_PS_RECORDS[1]);
  const invalid = [
    "", "   \t", `\n${first}`, `${first}\n\n${second}`, `${first}\n\n`,
    `${JSON.stringify(COMPOSE_V5_PS_RECORDS)}\n${first}`, `${first}\nnot-json`, `${first} trailing-garbage`, `${first}\n   `, `{
      "Service": "api"
    }`,
    "null", "true", "42", '"api"', "[]", JSON.stringify([COMPOSE_V5_PS_RECORDS[0], []]), `${first}\n[]`,
  ];
  for (const psStdout of invalid) {
    const { sources } = composeAuthorityFixture(psStdout);
    await assert.rejects(sources.composeAuthority(), /Compose ps|JSON|record|object|blank|encoding/i, JSON.stringify(psStdout));
  }
});

test("Compose ps records require nonempty string services and retain exact fixed service authority", async () => {
  for (const Service of [undefined, null, "", "   ", 7, ["api"], { name: "api" }]) {
    const records = structuredClone(COMPOSE_V5_PS_RECORDS); if (typeof Service === "undefined") delete records[0].Service; else records[0].Service = Service;
    await assert.rejects(composeAuthorityFixture(records.map((record) => JSON.stringify(record)).join("\n")).sources.composeAuthority(), /Compose ps|Service|string|nonempty/i);
  }
  for (const services of [["api", "postgres"], ["api", "postgres", "web", "worker"], ["api", "api", "postgres", "web"]]) {
    const records = services.map((Service, index) => ({ ...COMPOSE_V5_PS_RECORDS[index % COMPOSE_V5_PS_RECORDS.length], Service }));
    const authority = await composeAuthorityFixture(records.map((record) => JSON.stringify(record)).join("\n")).sources.composeAuthority();
    const facts = factsFixture(); facts.composeAuthority = authority;
    assert.throws(() => assertFixedRuntimeAuthority(facts), /Compose|service|authority/i, services.join(","));
  }
});

test("v4 verifier rejects extra evidence keys and any reconstructed runtime drift without writing", async () => {
  const evidence = { format: "blog-x-phase6-local-refresh-evidence", version: 3, implementationRevision: "a".repeat(40), lockfileSha256: "b".repeat(64), attemptClaim: { implementationRevision: "a".repeat(40), sha256: "c".repeat(64) }, oldImages: { api: SHA("a"), web: SHA("w") }, targets: { api: { id: SHA("n"), labels: {} }, web: { id: SHA("x"), labels: {} } }, stages: { preflight: projectSanitizedFacts(factsFixture()), postMigration: projectSanitizedFacts(factsFixture({ phase1: "2026-08-16T00:00:00.000Z" })), postCutover: projectSanitizedFacts(factsFixture({ apiImage: SHA("n"), webImage: SHA("x"), phase1: "2026-08-16T00:00:00.000Z" })) }, releaseState: "BLOCKED" };
  assert.doesNotMatch(JSON.stringify(evidence), /Mountpoint|relativePath|migration_fingerprint|applied_at/);
  assert.throws(() => projectSanitizedFacts({ ...factsFixture(), rawRows: ["secret"] }), /key|fact|raw/i);
});

function targetImage(app, id, revision, lock, seedId) {
  return { Id: id, Config: { Image: `blog-x-${app}-local:${revision.slice(0, 12)}`, WorkingDir: "/refresh-workspace", Cmd: ["corepack", "pnpm", "--filter", `@blog-x/${app}`, "start"], Labels: { "org.opencontainers.image.revision": revision, "io.blog-x.lockfile-sha256": lock, "io.blog-x.seed-image-id": seedId, "io.blog-x.application": app, "io.blog-x.public-origin": "http://127.0.0.1:3100", "io.blog-x.refresh-kind": "v1.1-offline-local-delivery" } } };
}

function liveFixture({ failPostCutover = false, preCutoverRouteDrift = false, rollbackRouteDrift = false, rollbackCutoverFault = false, stalePostCutover = false, recollectionFault = false, stageFaults = [], atomicFault, withdrawalFault, seedPrerequisite, acceptanceStdout = acceptanceOutput, acceptanceFailureClass, acceptanceFailureSecret = "", verificationChangedPaths, verificationTouchedPaths = verificationChangedPaths, identity = { uid: TEST_UID }, revision = TEST_REVISION, artifactFs, oldImages = { api: SHA("a"), web: SHA("b") }, targetIds = { api: SHA("e"), web: SHA("f") }, migrationUpgrade = false } = {}) {
  const lock = createHash("sha256").update("raw-lock\n").digest("hex");
  const old = structuredClone(oldImages);
  const evidencePath = deliveryAuthorityForRevision(revision).evidencePath;
  const changedPaths = verificationChangedPaths ?? [evidencePath];
  const touchedPaths = verificationTouchedPaths ?? changedPaths;
  const plan = createRefreshPlan({ revision, lockSha256: lock, apiSeedId: old.api, webSeedId: old.web });
  const targets = { api: targetImage("api", targetIds.api, revision, lock, old.api), web: targetImage("web", targetIds.web, revision, lock, old.web) };
  const calls = []; const routeFetches = []; let snapshot = 0; let rolledBack = false; let verificationMode = false; let staleVerification = false;
  let evidenceBaseFs;
  const runner = async (command, args, options = {}) => {
    calls.push({ command, args: [...args], options: structuredClone(options) });
    if (command === "docker" && args[0] === "context" && args[1] === "show") return { stdout: "colima\n" };
    if (command === "docker" && args[0] === "context" && args[1] === "inspect") return { stdout: JSON.stringify([{ Name: "colima", Endpoints: { docker: { Host: "unix:///Users/test/.colima/default/docker.sock" } } }]) };
    if (command === "docker" && args[0] === "image" && args[1] === "inspect") {
      const ref = args[2];
      const seed = (application, id) => ({ Id: seedPrerequisite === "stale" ? SHA(application === "api" ? "c" : "d") : id, Config: { WorkingDir: seedPrerequisite === "incompatible" ? "/workspace" : "/refresh-workspace", Labels: { "io.blog-x.application": application, "io.blog-x.lockfile-sha256": seedPrerequisite === "lock-drifted" ? "0".repeat(64) : lock, "io.blog-x.public-origin": "http://127.0.0.1:3100", "io.blog-x.refresh-kind": "phase6-offline" } } });
      if (seedPrerequisite === "missing" && ["blog-x-api-local", "blog-x-web-local"].includes(ref)) throw new Error("seed image unavailable: private registry reference");
      if (ref === "blog-x-api-local" || ref === old.api) return { stdout: JSON.stringify([seed("api", old.api)]) };
      if (ref === "blog-x-web-local" || ref === old.web) return { stdout: JSON.stringify([seed("web", old.web)]) };
      if (ref === plan.targets[0].tag) return { stdout: JSON.stringify([targets.api]) };
      if (ref === plan.targets[1].tag) return { stdout: JSON.stringify([targets.web]) };
      if (ref === targetIds.api) return { stdout: JSON.stringify([targets.api]) };
      if (ref === targetIds.web) return { stdout: JSON.stringify([targets.web]) };
    }
    if (command === "docker" && args[0] === "ps") return { stdout: `${JSON.stringify({ ID: "c".repeat(12), Names: "blogxlocal-web-1", Labels: "com.docker.compose.project=blogxlocal,com.docker.compose.service=web" })}\n` };
    if (command === "docker" && args[0] === "container" && args.length === 5) {
      snapshot += 1;
      const live = snapshot >= 3 && !rolledBack && (!failPostCutover || snapshot === 3) ? targetIds : old;
      return { stdout: JSON.stringify([inspectContainer("postgres", SHA("p")), inspectContainer("api", live.api), inspectContainer("web", live.web)]) };
    }
    if (command === "docker" && args[0] === "container") return { stdout: JSON.stringify([{ Image: targetIds.api, Config: { Image: plan.targets[0].tag, Labels: composeLabels("api", "True") } }]) };
    if (command === "docker" && args[0] === "volume") return { stdout: JSON.stringify([volumeFixture("blogxlocal_postgres-data"), volumeFixture("blogxlocal_media-data")]) };
    if (command === "docker" && args[0] === "run" && args[4] === "node" && [old.api, old.web].includes(args[5]) && seedPrerequisite === "incomplete-store") throw new Error("seed store path /private/secret failed");
    if (command === "docker" && args[0] === "run" && args.includes("corepack")) return { stdout: "/pnpm-store/v10\n" };
    if (command === "docker") return { stdout: "" };
    if (command === "docker-compose") {
      const joined = args.join(" "); const sql = args.at(-1);
      if (args.includes("up") && options.env?.BLOG_X_API_IMAGE === old.api) {
        if (rollbackCutoverFault) throw new Error("old image rollback cutover fault");
        rolledBack = true;
      }
      if (joined.endsWith("config --services")) return { stdout: "api\npostgres\nweb\n" };
      if (joined.endsWith("ps --all --format json")) return { stdout: JSON.stringify([{ Service: "api" }, { Service: "postgres" }, { Service: "web" }]) };
      if (args.includes("pg_dump")) return { stdout: "1\tarticle\n2\tarticle\n" };
      if (typeof sql === "string" && sql.includes("pg_sequences")) return { stdout: JSON.stringify([{ schemaname: "public", sequencename: "articles_id_seq", last_value: 3 }]) };
      if (typeof sql === "string" && sql.includes("blog_x_schema_ledger")) return { stdout: JSON.stringify([{ scope: "phase1", migration_count: migrationUpgrade && snapshot < 2 ? 7 : 8, migration_fingerprint: migrationUpgrade && snapshot < 2 ? "version-7" : "version-8", applied_at: snapshot >= 2 ? "2026-08-16T00:00:00.000Z" : "2026-08-15T00:00:00.000Z" }]) };
      if (typeof sql === "string" && sql.includes("current_database")) return { stdout: JSON.stringify({ name: "blog_x", systemIdentifier: "system-1" }) };
      if (typeof sql === "string" && sql.includes("information_schema.columns")) return { stdout: JSON.stringify(migrationUpgrade && snapshot < 2 ? [["column", "articles.id", "bigint:NO"]] : [["column", "articles.id", "bigint:NO"], ["table", "audit_events", "present"]]) };
      if (args.includes("api") && args.includes("node") && args.includes("-e")) return { stdout: JSON.stringify(failPostCutover && snapshot === 3 ? [{ relativePath: "asset", bytes: 8, sha256: "9".repeat(64) }] : [{ relativePath: "asset", bytes: 7, sha256: "8".repeat(64) }]) };
      return { stdout: "" };
    }
    if (command === "git" && args[0] === "status") return { stdout: !verificationMode && evidenceBaseFs?.entries.has(`/virtual-workspace/${evidencePath}`) ? `?? ${evidencePath}\n` : "" };
    if (command === "git" && args[0] === "symbolic-ref") return { stdout: "refs/heads/dev\n" };
    if (command === "git" && args[0] === "rev-parse") return { stdout: `${verificationMode ? "c".repeat(40) : revision}\n` };
    if (command === "git" && args[0] === "ls-files") return { stdout: "" };
    if (command === "git" && args[0] === "show") return { stdout: "raw-lock\n" };
    if (command === "git" && args[0] === "merge-base") return { stdout: "" };
    if (command === "git" && args[0] === "diff") return { stdout: `${changedPaths.join("\n")}\n` };
    if (command === "git" && args[0] === "log") return { stdout: `${touchedPaths.join("\0")}\0` };
    if (command === "node" && args.join(" ") === "scripts/local-delivery-acceptance.mjs") {
      if (acceptanceFailureClass) {
        const error = new Error(`raw acceptance output ${acceptanceFailureSecret} /private/secret/path`);
        Object.defineProperty(error, "acceptanceFailureClass", { value: acceptanceFailureClass });
        throw error;
      }
      return { stdout: acceptanceStdout };
    }
    if (command === "node") return { stdout: "" };
    throw new Error(`unexpected raw fake argv: ${command} ${args.join(" ")}`);
  };
  evidenceBaseFs = artifactFs ?? memoryArtifactFs("/virtual-workspace", identity.uid);
  const evidenceFs = atomicFault ? atomicFaultFs(evidenceBaseFs, "evidence", atomicFault)
    : withdrawalFault ? withdrawalFaultFs(evidenceBaseFs, withdrawalFault) : evidenceBaseFs;
  const fetch = async (url, options) => {
    const path = url.slice("http://127.0.0.1:3100".length);
    if (path === "/api/public/articles?page=1") {
      routeFetches.push({ path, snapshot, rolledBack, stale: false, options: structuredClone(options) });
      return fakeRouteResponse(url, { status: 200, body: publicListBody, contentType: "application/json; charset=utf-8" });
    }
    if (path === `/posts/${encodeURIComponent(publicListItem.slug)}`) {
      routeFetches.push({ path, snapshot, rolledBack, stale: false, options: structuredClone(options) });
      return fakeRouteResponse(url, { status: 200, body: "<html>post</html>", contentType: "text/html; charset=utf-8" });
    }
    const stale = rolledBack || snapshot < 3 || stalePostCutover && snapshot >= 3 || verificationMode && staleVerification;
    const responses = stale ? structuredClone(staleRouteResponses) : finalRouteResponses;
    if (preCutoverRouteDrift && snapshot === 2) responses["/api/public/search?q="].body = `${STALE_SEARCH_BODY} drift`;
    if (rollbackRouteDrift && rolledBack) responses["/api/public/search?q="].body = `${STALE_SEARCH_BODY} rollback drift`;
    routeFetches.push({ path, snapshot, rolledBack, stale, options: structuredClone(options) });
    return fakeRouteResponse(url, responses[path]);
  };
  const runtime = createRefreshTestRuntime({ processBoundary: runner, fs: evidenceFs, fetch, identity, clock(stage) {
    if (withdrawalFault ? stage === "final_output" : stage === "evidence_verification") evidenceFs.arm?.();
    if (recollectionFault && stage === "failure_recollection" || stageFaults.includes(stage)) throw new Error(`${stage} fault`);
  }, randomHex: () => "3".repeat(24) });
  const adapter = runtime.createAdapter();
  return { adapter, calls, evidenceFs, old, plan, revision, routeFetches, targetIds, runtime, beginVerification() { verificationMode = true; }, serveStaleVerification() { staleVerification = true; }, serveFinalVerification() { staleVerification = false; } };
}

test("full isolated acceptance is one strict pre-cutover barrier and failure leaves canonical runtime untouched", async () => {
  const good = liveFixture();
  await runLocalRefresh({ adapter: good.adapter, plan: good.plan });
  const acceptanceCall = good.calls.findIndex((call) => call.command === "node" && call.args.join(" ") === "scripts/local-delivery-acceptance.mjs");
  const migrationCall = good.calls.findIndex((call) => call.command === "docker-compose" && call.args.includes("run"));
  assert.ok(acceptanceCall >= 0 && acceptanceCall < migrationCall);

  for (const acceptanceStdout of ["", `${acceptanceOutput}${acceptanceOutput}`, acceptanceOutput.replace('"releaseState":"BLOCKED"', '"releaseState":"READY"'), acceptanceOutput.replace('"tests":24,"passed":24', '"tests":0,"passed":0')]) {
    const fixture = liveFixture({ acceptanceStdout });
    await assert.rejects(fixture.runtime.runCli(), /accept-v1\.1/i);
    assert.equal(fixture.calls.some((call) => call.command === "docker-compose" && (call.args.includes("run") || call.args.includes("up"))), false);
    assert.equal(fixture.calls.some((call) => call.command === "docker" && call.args[0] === "rm"), false);
    const report = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
    assert.equal(report.report.stage, "accept-v1.1");
  }
});

test("generated and Phase 7 typed failures persist distinct allowlisted secret-free error classes", async () => {
  const secret = "super-secret-token-value";
  for (const errorClass of ["generated_child_exit", "phase7_timeout", "generated_output_limit", "phase7_cleanup_unconfirmed"]) {
    const fixture = liveFixture({ acceptanceFailureClass: errorClass, acceptanceFailureSecret: secret });
    await assert.rejects(fixture.runtime.runCli(), /accept-v1\.1/i);
    const failure = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
    assert.equal(failure.report.stage, "accept-v1.1");
    assert.equal(failure.report.errorClass, errorClass);
    assert.ok(REFRESH_FAILURE_CLASSES.includes(failure.report.errorClass));
    assert.doesNotMatch(JSON.stringify(failure.report), new RegExp(`${secret}|raw acceptance output|/private/secret/path`, "i"));
  }
});

test("failure report schema accepts only stable allowlisted classes and live runner preserves typed acceptance records", async () => {
  const liveSource = await readFile(join(process.cwd(), "scripts/refresh-local-live.mjs"), "utf8");
  assert.match(liveSource, /parseLocalDeliveryAcceptanceFailure/);
  assert.doesNotMatch(liveSource, /new Error\(`\$\{command\} failed/);

  const fixture = liveFixture();
  const store = fixture.runtime.createAttemptStore();
  const claim = await store.claimRefreshAttempt(fixture.revision);
  await assert.rejects(store.writeFailureReport({
    format: "blog-x-local-refresh-failure",
    version: 1,
    implementationRevision: fixture.revision,
    claimSha256: claim.sha256,
    stage: "accept-v1.1",
    errorClass: "attacker_chosen_class",
    baseline: "applicable",
    recollection: "failed",
    preservation: "unproved",
    facts: { preflight: null, current: null, rollback: null },
  }), /failure report schema/i);
});

test("normal delivery emits exact progress and a verified evidence-derived BLOCKED terminal block", async () => {
  const fixture = liveFixture(); const writes = [];
  const result = await fixture.runtime.runCli({ output: { write(value) { writes.push(value); } } });
  assert.equal(result.releaseState, "BLOCKED");
  const output = writes.join("");
  for (const stage of ["cli_validation", "source_authority", "attempt_claim_preflight", "attempt_claim_publication", "adapter_construction", "claim_attachment", "lockfile_plan_materialization", "preflight_collection", "seed-prerequisites", "build-api", "build-web", "inspect-target-images", "accept-v1.1", "migrate", "schema-verify", "cutover-api-web", "routes", "release-blocked", "write-evidence", "evidence_verification", "final_output"]) {
    assert.equal(output.split(`LOCAL DELIVERY STAGE ${stage} START\n`).length - 1, 1, `${stage} start`);
    assert.equal(output.split(`LOCAL DELIVERY STAGE ${stage} COMPLETE\n`).length - 1, 1, `${stage} complete`);
  }
  assert.match(output, new RegExp(`REVISION ${fixture.revision}`));
  assert.match(output, /URL http:\/\/127\.0\.0\.1:3100/);
  assert.match(output, /ROUTES \/search=200 \/api\/health=200/);
  assert.match(output, /READING verified/);
  assert.match(output, /VISIBLE search=200 reading=verified/);
  assert.match(output, /ACCEPTANCE generated=18 phase7=6 total=24/);
  assert.equal(output.includes(`EVIDENCE ${TEST_EVIDENCE_PATH}\nRELEASE BLOCKED`), true);
  assert.doesNotMatch(output, /hello-world|postgres:\/\/|blog_x_session=|token=|\/Users\/|sha256:/i);
});

test("formal delivery accepts one verified forward schema migration and seals the migrated evidence", async () => {
  const fixture = liveFixture({ migrationUpgrade: true });
  const result = await fixture.runtime.runCli();
  assert.equal(result.implementationRevision, fixture.revision);
  const evidence = JSON.parse(await fixture.evidenceFs.readFile(`/virtual-workspace/${TEST_EVIDENCE_PATH}`));
  assert.notEqual(evidence.stages.preflight.ledger.rows.phase1.stableSha256, evidence.stages.postMigration.ledger.rows.phase1.stableSha256);
  assert.notEqual(evidence.stages.preflight.database.schemaSha256, evidence.stages.postMigration.database.schemaSha256);
  assert.deepEqual(evidence.stages.postMigration.database, evidence.stages.postCutover.database);
  assert.deepEqual(evidence.stages.postMigration.ledger.rows.phase1, evidence.stages.postCutover.ledger.rows.phase1);
});

test("later evidence verification admits only the receipt and finite Phase 08 closeout documents", async () => {
  const allowed = [
    TEST_EVIDENCE_PATH,
    ".planning/phases/08-reliable-local-delivery/08-04-SUMMARY.md",
    ".planning/phases/08-reliable-local-delivery/08-05-SUMMARY.md",
    ".planning/phases/08-reliable-local-delivery/08-06-SUMMARY.md",
    ".planning/phases/08-reliable-local-delivery/08-07-SUMMARY.md",
    ".planning/phases/08-reliable-local-delivery/08-08-SUMMARY.md",
    ".planning/phases/08-reliable-local-delivery/08-09-SUMMARY.md",
    ".planning/phases/08-reliable-local-delivery/08-VERIFICATION.md",
    ".planning/ROADMAP.md",
    ".planning/STATE.md",
    ".planning/REQUIREMENTS.md",
  ];
  const accepted = liveFixture({ verificationChangedPaths: allowed });
  await accepted.runtime.runCli();
  accepted.beginVerification();
  await assert.doesNotReject(accepted.runtime.verifyEvidence(`/virtual-workspace/${TEST_EVIDENCE_PATH}`));

  for (const path of [
    ".planning/phases/08-reliable-local-delivery/08-REVIEW.md",
    ".planning/phases/08-reliable-local-delivery/08-REVIEW-FIX.md",
    ".planning/phases/08-reliable-local-delivery/08-04-PLAN.md",
    ".planning/phases/08-reliable-local-delivery/08-CONTEXT.md",
    ".planning/config.json",
    ".planning/phases/08-reliable-local-delivery/08-10-SUMMARY.md",
    "scripts/refresh-local.mjs",
  ]) {
    const rejected = liveFixture({ verificationChangedPaths: [TEST_EVIDENCE_PATH, path] });
    await rejected.runtime.runCli();
    rejected.beginVerification();
    await assert.rejects(rejected.runtime.verifyEvidence(`/virtual-workspace/${TEST_EVIDENCE_PATH}`), /docs-only allowlist|intervening Git paths/i, path);
  }

  const reverted = liveFixture({
    verificationChangedPaths: [TEST_EVIDENCE_PATH, ".planning/phases/08-reliable-local-delivery/08-09-SUMMARY.md"],
    verificationTouchedPaths: [TEST_EVIDENCE_PATH, ".planning/phases/08-reliable-local-delivery/08-09-SUMMARY.md", "scripts/refresh-local.mjs"],
  });
  await reverted.runtime.runCli();
  reverted.beginVerification();
  await assert.rejects(reverted.runtime.verifyEvidence(`/virtual-workspace/${TEST_EVIDENCE_PATH}`), /docs-only allowlist|intervening Git paths/i);
  assert.ok(reverted.calls.some(({ command, args }) => command === "git" && args[0] === "log" && args.includes("-m") && args.includes("--no-renames") && args.includes("-z")));
  assert.equal(reverted.calls.some(({ command, args }) => command === "git" && args[0] === "diff"), false);
});

test("independent verification rejects substituted receipt filesystem authority", async () => {
  const absolute = `/virtual-workspace/${TEST_EVIDENCE_PATH}`;
  for (const mutate of [
    (item) => { item.kind = "symlink"; },
    (item) => { item.nlink = 2; },
    (item) => { item.uid = TEST_UID + 1; },
    (item) => { item.mode = 0o644; },
    (item) => { item.realpath = "/private/tmp/substitute.json"; },
  ]) {
    const fixture = liveFixture();
    await fixture.runtime.runCli();
    fixture.beginVerification();
    mutate(fixture.evidenceFs.entries.get(absolute));
    await assert.rejects(fixture.runtime.verifyEvidence(absolute), /evidence file authority|unsafe/i);
  }
});

test("test-only verifier identity is portable while mismatched receipt ownership still fails", async () => {
  const absolute = `/virtual-workspace/${TEST_EVIDENCE_PATH}`;
  const identity = { uid: 1000 };
  const fixture = liveFixture({ identity });
  await fixture.runtime.runCli();
  fixture.beginVerification();
  await assert.doesNotReject(fixture.runtime.verifyEvidence(absolute));
  fixture.evidenceFs.entries.get(absolute).uid = identity.uid + 1;
  await assert.rejects(fixture.runtime.verifyEvidence(absolute), /evidence file authority|unsafe/i);
});

test("two successive clean revisions publish distinct verified receipts and preserve the first bytes", async () => {
  const revisionA = "a".repeat(40);
  const revisionB = "b".repeat(40);
  const sharedFs = memoryArtifactFs();
  const first = liveFixture({ revision: revisionA, artifactFs: sharedFs, targetIds: { api: SHA("e"), web: SHA("f") } });
  await first.runtime.runCli();
  const pathA = `/virtual-workspace/${deliveryAuthorityForRevision(revisionA).evidencePath}`;
  const bytesA = await sharedFs.readFile(pathA);
  const digestA = createHash("sha256").update(bytesA).digest("hex");
  const firstDockerCalls = first.calls.filter(({ command }) => command === "docker").length;
  const firstAdapters = first.runtime.adapterConstructionCount();
  await assert.rejects(first.runtime.runCli(), /attempt_claim_preflight/i);
  assert.equal(first.calls.filter(({ command }) => command === "docker").length, firstDockerCalls);
  assert.equal(first.runtime.adapterConstructionCount(), firstAdapters);

  const second = liveFixture({
    revision: revisionB,
    artifactFs: sharedFs,
    oldImages: first.targetIds,
    targetIds: { api: SHA("1"), web: SHA("2") },
  });
  await second.runtime.runCli();
  const pathB = `/virtual-workspace/${deliveryAuthorityForRevision(revisionB).evidencePath}`;
  const bytesB = await sharedFs.readFile(pathB);
  assert.notEqual(pathA, pathB);
  assert.notEqual(bytesA, bytesB);
  assert.equal(await sharedFs.readFile(pathA), bytesA);
  assert.equal(createHash("sha256").update(await sharedFs.readFile(pathA)).digest("hex"), digestA);
  assert.equal(second.runtime.reads.includes(pathA), false);
  const secondDockerCalls = second.calls.filter(({ command }) => command === "docker").length;
  const secondAdapters = second.runtime.adapterConstructionCount();
  await assert.rejects(second.runtime.runCli(), /attempt_claim_preflight/i);
  assert.equal(second.calls.filter(({ command }) => command === "docker").length, secondDockerCalls);
  assert.equal(second.runtime.adapterConstructionCount(), secondAdapters);

  const foreignRevision = "c".repeat(40);
  const foreignPath = `/virtual-workspace/${deliveryAuthorityForRevision(foreignRevision).evidencePath}`;
  sharedFs.entries.set(foreignPath, { kind: "file", bytes: bytesB, uid: TEST_UID, mode: 0o600 });
  await assert.rejects(second.runtime.verifyEvidence(foreignPath), /filename SHA|immutable identity|claim|revision|authority/i);
  assert.equal(await sharedFs.readFile(pathA), bytesA);
  assert.equal(await sharedFs.readFile(pathB), bytesB);
});

test("terminal stage progress and recovery are exhaustive, exact and sanitized", () => {
  const expected = ["cli_validation", "source_authority", "attempt_claim_preflight", "attempt_claim_publication", "adapter_construction", "claim_attachment", "lockfile_plan_materialization", "local_docker_authority", "preflight_collection", "seed-prerequisites", "build-api", "build-web", "inspect-target-images", "accept-v1.1", "migrate", "schema-verify", "cutover-api-web", "routes", "release-blocked", "write-evidence", "evidence_verification", "final_output", "rollback-api-web", "verify-rollback", "failure_recollection", "failure_report_publication"];
  assert.deepEqual(REFRESH_TERMINAL_STAGES, expected);
  assert.deepEqual(Object.keys(SAFE_RECOVERY_BY_STAGE), expected);
  for (const stage of expected) {
    assert.equal(formatRefreshStageProgress(stage, "start"), `LOCAL DELIVERY STAGE ${stage} START\n`);
    assert.equal(formatRefreshStageProgress(stage, "complete"), `LOCAL DELIVERY STAGE ${stage} COMPLETE\n`);
    const recovery = safeRecoveryForRefreshFailure({ stage, error: new Error("sentinel child output") });
    assert.equal(typeof recovery, "string");
    assert.ok(recovery.length > 20);
    const failure = formatRefreshFailure({ stage, recovery });
    assert.match(failure, new RegExp(`STAGE ${stage}`));
    assert.doesNotMatch(failure, /sentinel child output|postgres:\/\/|token=|\/Users\/|sha256:/i);
  }
  for (const kind of SEED_PREREQUISITE_KINDS) {
    const error = Object.assign(new Error("raw seed detail"), { seedPrerequisite: kind });
    assert.equal(safeRecoveryForRefreshFailure({ stage: "seed-prerequisites", error }), formatSeedPrewarmInstruction(kind));
  }
  assert.doesNotMatch(JSON.stringify(SAFE_RECOVERY_BY_STAGE), /\b(?:ssh|scp|rsync|deploy|registry|volume rm|down migration|alternate port|other project)\b/i);
});

test("complete fake live refresh uses target API one-off, immutable cutover and sanitized atomic v4 evidence", async () => {
  const fixture = liveFixture();
  await runLocalRefresh({ adapter: fixture.adapter, plan: fixture.plan });
  const oneoff = `blogxlocal-api-refresh-${fixture.revision.slice(0, 12)}`;
  const migration = fixture.calls.find((call) => call.command === "docker" && call.args.includes("db:migrate"));
  const schema = fixture.calls.find((call) => call.command === "docker" && call.args.includes("db:schema:verify"));
  assert.equal(migration.args[1], oneoff); assert.equal(schema.args[1], oneoff);
  assert.ok(fixture.calls.some((call) => call.command === "docker-compose" && call.args.includes("run") && call.options.env.BLOG_X_API_IMAGE === fixture.plan.targets[0].tag));
  assert.ok(fixture.calls.some((call) => call.command === "docker-compose" && call.args.includes("up") && call.options.env.BLOG_X_API_IMAGE === fixture.targetIds.api && call.options.env.BLOG_X_WEB_IMAGE === fixture.targetIds.web));
  const bytes = await fixture.evidenceFs.readFile(`/virtual-workspace/${TEST_EVIDENCE_PATH}`);
  const evidence = JSON.parse(bytes);
  assert.equal(evidence.version, 1); assert.equal(evidence.format, "blog-x-v1.1-local-delivery-evidence"); assert.equal(evidence.releaseState, "BLOCKED");
  assert.deepEqual(evidence.acceptance.counts, acceptanceRecord.counts);
  assert.match(evidence.acceptance.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.stages.postCutover.reading, verifiedReading);
  assert.deepEqual(evidence.stages.preflight.routes, evidence.stages.postMigration.routes);
  assert.equal(evidence.stages.preflight.routes["/api/public/search?q="].status, 404);
  assert.equal(evidence.stages.preflight.routes["/api/public/search?q="].contractSha256, null);
  assert.match(evidence.stages.preflight.routes["/api/public/articles/phase6-unknown/related"].contractSha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.stages.postCutover.routes["/api/public/search?q="].status, 200);
  assert.match(evidence.stages.postCutover.routes["/api/public/search?q="].contractSha256, /^[a-f0-9]{64}$/);
  const singularArchive = "/archives".slice(0, -1);
  for (const facts of Object.values(evidence.stages)) {
    assert.equal(Object.hasOwn(facts.routes, "/archives"), true);
    assert.equal(Object.hasOwn(facts.routes, singularArchive), false);
  }
  assert.doesNotMatch(bytes, /Mountpoint|relativePath|migration_fingerprint|applied_at|environment|command|private\/var|legacy search route missing|legacy_route_missing|content-type|problem\+json/i);
  assert.equal([...fixture.evidenceFs.entries.keys()].some((path) => path.endsWith(".tmp")), false);
  assert.deepEqual(fixture.calls.filter((call) => call.command === "docker" && call.args[0] === "rm").map((call) => call.args), [["rm", "-f", oneoff]]);
  const evidencePath = `/virtual-workspace/${TEST_EVIDENCE_PATH}`;
  const singularEvidence = structuredClone(evidence);
  for (const facts of Object.values(singularEvidence.stages)) {
    facts.routes[singularArchive] = facts.routes["/archives"];
    delete facts.routes["/archives"];
  }
  fixture.evidenceFs.entries.get(evidencePath).bytes = `${JSON.stringify(singularEvidence, null, 2)}\n`;
  await assert.rejects(fixture.runtime.verifyEvidence(evidencePath), /route|key|archive|evidence/i);
  fixture.evidenceFs.entries.get(evidencePath).bytes = bytes;
  const forgedFinal = structuredClone(evidence);
  forgedFinal.stages.postCutover.routes["/api/health"].contractSha256 = "9".repeat(64);
  fixture.evidenceFs.entries.get(evidencePath).bytes = `${JSON.stringify(forgedFinal, null, 2)}\n`;
  await assert.rejects(fixture.runtime.verifyEvidence(evidencePath), /final|route|contract|evidence/i);
  fixture.evidenceFs.entries.get(evidencePath).bytes = bytes;
  const forgedAcceptance = structuredClone(evidence);
  forgedAcceptance.acceptance.sha256 = "0".repeat(64);
  fixture.evidenceFs.entries.get(evidencePath).bytes = `${JSON.stringify(forgedAcceptance, null, 2)}\n`;
  await assert.rejects(fixture.runtime.verifyEvidence(evidencePath), /acceptance|digest/i);
  fixture.evidenceFs.entries.get(evidencePath).bytes = bytes;
  const refDrift = structuredClone(evidence);
  refDrift.stages.postMigration.git.ref = "refs/heads/other";
  fixture.evidenceFs.entries.get(evidencePath).bytes = `${JSON.stringify(refDrift, null, 2)}\n`;
  await assert.rejects(fixture.runtime.verifyEvidence(evidencePath), /Git|ref|linkage|inconsistent/i);
  fixture.evidenceFs.entries.get(evidencePath).bytes = bytes;
  fixture.beginVerification();
  assert.equal((await fixture.runtime.verifyEvidence(`/virtual-workspace/${TEST_EVIDENCE_PATH}`)).releaseState, "BLOCKED");
  assert.equal(await fixture.evidenceFs.readFile(`/virtual-workspace/${TEST_EVIDENCE_PATH}`), bytes);
  assert.ok(fixture.calls.some((call) => call.command === "git" && call.args[0] === "show"));
  assert.ok(fixture.calls.some((call) => call.command === "git" && call.args[0] === "merge-base"));
  assert.ok(fixture.calls.some((call) => call.command === "git" && call.args[0] === "log"));
  assert.equal(fixture.calls.some((call) => call.command === "git" && call.args[0] === "diff"), false);
  assert.ok(fixture.runtime.reads.includes("/virtual-workspace/pnpm-lock.yaml"));
  assert.ok(fixture.runtime.reads.includes("/virtual-workspace/ops/phase5-full-gate-receipt.json"));
  assert.ok(fixture.calls.some((call) => call.command === "docker" && call.args.join(" ") === "image inspect blog-x-api-local"));
  assert.ok(fixture.calls.some((call) => call.command === "docker" && call.args.join(" ") === `image inspect ${fixture.targetIds.api}`));
  assert.equal(fixture.runtime.fetches.length >= 18, true);
  fixture.serveStaleVerification();
  await assert.rejects(fixture.runtime.verifyEvidence(evidencePath), /route|contract|drift|search/i);
  fixture.serveFinalVerification();
  fixture.evidenceFs.entries.get("/virtual-workspace/ops/phase5-full-gate-receipt.json").bytes = "raw drift\n";
  await assert.rejects(fixture.runtime.verifyEvidence(`/virtual-workspace/${TEST_EVIDENCE_PATH}`), /drift/i);
});

test("seed prerequisites classify only trusted validation failures before every build and print one redacted pre-warm instruction", async () => {
  assert.deepEqual(SEED_PREREQUISITE_KINDS, ["missing", "stale", "incompatible", "lock-drifted", "incomplete-store"]);
  const image = { Id: SHA("a"), Config: { WorkingDir: "/refresh-workspace", Labels: { "io.blog-x.application": "api", "io.blog-x.lockfile-sha256": "b".repeat(64), "io.blog-x.public-origin": "http://127.0.0.1:3100" } } };
  assert.doesNotThrow(() => assertSeedPrerequisiteFacts({ application: "api", expectedId: SHA("a"), image, lockfileSha256: "b".repeat(64) }));
  assert.equal(classifySeedPrerequisiteFailure(new Error("child stderr mentioned missing")), null);
  for (const kind of SEED_PREREQUISITE_KINDS) {
    const fixture = liveFixture({ seedPrerequisite: kind }); const output = [];
    await assert.rejects(fixture.runtime.runCli({ output: { write(value) { output.push(value); } } }), /seed-prerequisites/);
    const combined = output.join("");
    assert.equal(combined.split(formatSeedPrewarmInstruction(kind)).length - 1, 1, kind);
    assert.match(combined, /LOCAL DELIVERY FAILED\nSTAGE seed-prerequisites\nRECOVERY /);
    assert.doesNotMatch(combined, /sha256:|private|registry|\/pnpm-store|\/private|3100|blogxlocal|digest|secret/i);
    assert.equal(fixture.calls.some((call) => call.command === "docker" && call.args[0] === "build"), false, kind);
    assert.equal(fixture.calls.some((call) => call.command === "docker-compose" && (call.args.includes("run") || call.args.includes("up"))), false, kind);
    assert.equal((await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision)).report.stage, "seed-prerequisites");
  }
  const nonSeed = liveFixture({ stageFaults: ["build-api"] }); const nonSeedOutput = [];
  await assert.rejects(nonSeed.runtime.runCli({ output: { write(value) { nonSeedOutput.push(value); } } }), /build-api/);
  assert.match(nonSeedOutput.join(""), /LOCAL DELIVERY FAILED\nSTAGE build-api\nRECOVERY /);
});

test("post-cutover fact failure rolls back API/Web by immutable IDs and suppresses evidence", async () => {
  const fixture = liveFixture({ failPostCutover: true });
  await assert.rejects(runLocalRefresh({ adapter: fixture.adapter, plan: fixture.plan }), /media|persistence/i);
  const cutovers = fixture.calls.filter((call) => call.command === "docker-compose" && call.args.includes("up"));
  assert.deepEqual(cutovers.map((call) => call.options.env), [
    { BLOG_X_API_IMAGE: fixture.targetIds.api, BLOG_X_WEB_IMAGE: fixture.targetIds.web },
    { BLOG_X_API_IMAGE: fixture.old.api, BLOG_X_WEB_IMAGE: fixture.old.web },
  ]);
  await assert.rejects(fixture.evidenceFs.readFile(`/virtual-workspace/${TEST_EVIDENCE_PATH}`), /ENOENT/);
  assert.equal(fixture.calls.some((call) => call.args.includes("down") || call.args.includes("postgres") && call.args[0] === "rm" || call.command === "docker" && call.args[0] === "volume" && call.args[1] !== "inspect"), false);
});

test("outer evidence and terminal failures retain rollback authority and cannot leave false success", async () => {
  const evidencePath = `/virtual-workspace/${TEST_EVIDENCE_PATH}`;
  for (const stage of ["evidence_verification", "final_output"]) {
    const fixture = liveFixture({ stageFaults: [stage] }); const writes = [];
    await assert.rejects(fixture.runtime.runCli({ output: { write(value) { writes.push(value); } } }), new RegExp(stage));
    const cutovers = fixture.calls.filter((call) => call.command === "docker-compose" && call.args.includes("up"));
    assert.deepEqual(cutovers.map((call) => call.options.env), [
      { BLOG_X_API_IMAGE: fixture.targetIds.api, BLOG_X_WEB_IMAGE: fixture.targetIds.web },
      { BLOG_X_API_IMAGE: fixture.old.api, BLOG_X_WEB_IMAGE: fixture.old.web },
    ], stage);
    assert.equal(fixture.routeFetches.some(({ rolledBack, stale }) => rolledBack && stale), true, stage);
    await assert.rejects(fixture.evidenceFs.readFile(evidencePath), /ENOENT/, stage);
    assert.doesNotMatch(writes.join(""), /^REVISION |^EVIDENCE |^RELEASE BLOCKED$/m, stage);
    assert.equal((await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision)).report.stage, stage);
  }

  const fixture = liveFixture(); const writes = [];
  await assert.rejects(fixture.runtime.runCli({ output: { write(value) {
    if (String(value).startsWith("REVISION ")) throw new Error("terminal write fault");
    writes.push(value);
  } } }), /final_output/);
  const cutovers = fixture.calls.filter((call) => call.command === "docker-compose" && call.args.includes("up"));
  assert.deepEqual(cutovers.map((call) => call.options.env), [
    { BLOG_X_API_IMAGE: fixture.targetIds.api, BLOG_X_WEB_IMAGE: fixture.targetIds.web },
    { BLOG_X_API_IMAGE: fixture.old.api, BLOG_X_WEB_IMAGE: fixture.old.web },
  ]);
  await assert.rejects(fixture.evidenceFs.readFile(evidencePath), /ENOENT/);
  assert.doesNotMatch(writes.join(""), /^REVISION |^EVIDENCE |^RELEASE BLOCKED$/m);
  assert.equal((await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision)).report.stage, "final_output");
});

test("evidence withdrawal faults cannot block old-image rollback or its verified facts", async () => {
  for (const withdrawalFault of ["lstat", "realpath", "unlink", "directory_sync"]) {
    const fixture = liveFixture({ stageFaults: ["final_output"], withdrawalFault });
    await assert.rejects(fixture.runtime.runCli(), /verify-rollback/i, withdrawalFault);
    const cutovers = fixture.calls.filter((call) => call.command === "docker-compose" && call.args.includes("up"));
    assert.deepEqual(cutovers.map((call) => call.options.env), [
      { BLOG_X_API_IMAGE: fixture.targetIds.api, BLOG_X_WEB_IMAGE: fixture.targetIds.web },
      { BLOG_X_API_IMAGE: fixture.old.api, BLOG_X_WEB_IMAGE: fixture.old.web },
    ], withdrawalFault);
    assert.equal(fixture.routeFetches.some(({ rolledBack, stale }) => rolledBack && stale), true, withdrawalFault);
    const report = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
    assert.equal(report.report.stage, "verify-rollback", withdrawalFault);
    assert.equal(report.report.errorClass, "evidence_cleanup_error_after_verified_rollback", withdrawalFault);
    assert.match(report.report.facts.rollback, /^[a-f0-9]{64}$/, withdrawalFault);
  }
});

test("runtime rollback and evidence cleanup failures remain jointly classified", async () => {
  const fixture = liveFixture({ stageFaults: ["final_output"], rollbackCutoverFault: true, withdrawalFault: "unlink" });
  await assert.rejects(fixture.runtime.runCli(), /rollback-api-web/i);
  const report = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
  assert.equal(report.report.stage, "rollback-api-web");
  assert.equal(report.report.errorClass, "runtime_rollback_and_evidence_cleanup_error");
  assert.equal(fixture.calls.filter((call) => call.command === "docker-compose" && call.args.includes("up")).length, 2);
});

test("stale preflight reaches both builds but exact observation drift stops before cutover", async () => {
  const fixture = liveFixture({ preCutoverRouteDrift: true });
  await assert.rejects(runLocalRefresh({ adapter: fixture.adapter, plan: fixture.plan }), /route|observation|pre-cutover/i);
  assert.equal(fixture.calls.some((call) => call.command === "docker" && call.args[0] === "build" && call.args.includes("apps/api/Dockerfile.refresh")), true);
  assert.equal(fixture.calls.some((call) => call.command === "docker" && call.args[0] === "build" && call.args.includes("apps/web/Dockerfile.refresh")), true);
  assert.equal(fixture.calls.some((call) => call.command === "docker-compose" && call.args.includes("up")), false);
});

test("stale postCutover fails final authority and rollback must restore exact stale observations", async () => {
  const staleFinal = liveFixture({ stalePostCutover: true });
  await assert.rejects(runLocalRefresh({ adapter: staleFinal.adapter, plan: staleFinal.plan }), /route|contract|search/i);
  const cutovers = staleFinal.calls.filter((call) => call.command === "docker-compose" && call.args.includes("up"));
  assert.deepEqual(cutovers.map((call) => call.options.env), [
    { BLOG_X_API_IMAGE: staleFinal.targetIds.api, BLOG_X_WEB_IMAGE: staleFinal.targetIds.web },
    { BLOG_X_API_IMAGE: staleFinal.old.api, BLOG_X_WEB_IMAGE: staleFinal.old.web },
  ]);
  assert.equal(staleFinal.routeFetches.some(({ snapshot, rolledBack, stale }) => snapshot >= 3 && !rolledBack && stale), true);
  assert.equal(staleFinal.routeFetches.some(({ rolledBack, stale }) => rolledBack && stale), true);

  const rollbackDrift = liveFixture({ failPostCutover: true, rollbackRouteDrift: true });
  await assert.rejects(runLocalRefresh({ adapter: rollbackDrift.adapter, plan: rollbackDrift.plan }), /rollback routes|preflight observations/i);
});

test("failure recollection hashes stale route projections without retaining raw responses", async () => {
  const fixture = liveFixture({ stageFaults: ["build-api"] });
  await assert.rejects(fixture.runtime.runCli(), /build-api/);
  const report = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
  assert.equal(report.report.stage, "build-api");
  assert.equal(report.report.recollection, "collected");
  assert.match(report.report.facts.preflight, /^[a-f0-9]{64}$/);
  assert.match(report.report.facts.current, /^[a-f0-9]{64}$/);
  assert.equal(report.report.facts.rollback, null);
  assert.doesNotMatch(report.bytes, /legacy search route missing|legacy_route_missing|content-type|text\/html|problem\+json|http:\/\/127\.0\.0\.1:3100/i);
});

test("v4 projection is revision and schema complete with row-addressed sanitized ledger transitions", () => {
  const facts = factsFixture();
  facts.git = { implementationRevision: "a".repeat(40), clean: true, lockfileSha256: "b".repeat(64), ref: "refs/heads/dev" };
  facts.database = { name: "blog_x", systemIdentifier: "1".repeat(32), schemaSha256: "2".repeat(64), schemaRows: 12 };
  facts.seeds = { api: { reference: "blog-x-api-local", inspectedId: SHA("a") }, web: { reference: "blog-x-web-local", inspectedId: SHA("b") } };
  facts.targets = { api: { id: SHA("e"), labelsSha256: "3".repeat(64), filesystemSha256: "4".repeat(64), storeSha256: "5".repeat(64) }, web: { id: SHA("f"), labelsSha256: "6".repeat(64), filesystemSha256: "7".repeat(64), storeSha256: "8".repeat(64) } };
  facts.ledger.push({ scope: "phase5", migration_count: 2, migration_fingerprint: "secret-fingerprint", applied_at: "2026-08-15T00:00:00.000Z" });
  const projection = projectSanitizedFacts(facts);
  assert.deepEqual(Object.keys(projection.git).sort(), ["clean", "implementationRevision", "lockfileSha256", "ref"]);
  assert.deepEqual(Object.keys(projection.database).sort(), ["name", "schemaRows", "schemaSha256", "systemIdentifier"]);
  assert.deepEqual(Object.keys(projection.ledger.rows).sort(), ["phase1", "phase5"]);
  assert.deepEqual(Object.keys(projection.ledger.rows.phase1).sort(), ["appliedAt", "stableSha256"]);
  assert.doesNotMatch(JSON.stringify(projection), /secret-fingerprint|migration_fingerprint/);
});

test("empty argv publishes claim before adapter construction and every later failure writes a durable report", async () => {
  const revision = "c".repeat(40); const fs = memoryArtifactFs();
  const runtime = createRefreshTestRuntime({ fs, randomHex: () => "d".repeat(24), fetch: async () => { throw new Error("unused"); }, clock(stage) { if (stage === "adapter_construction") throw new Error("daemon rejected"); }, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "symbolic-ref" ? "refs/heads/dev\n" : command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
  await assert.rejects(runtime.runCli(), /adapter_construction/);
  const claim = await runtime.inspectClaim(revision);
  const report = await runtime.createAttemptStore().assertFailureReportPresent(revision);
  assert.equal(report.report.claimSha256, claim.sha256);
  assert.equal(report.report.stage, "adapter_construction");
  assert.equal(runtime.calls.filter((call) => call.command === "docker").length, 0);
});

test("failure-report CLI is exact, canonical, read-only and does not construct process or adapter authority", async () => {
  const revision = "d".repeat(40); const writes = []; const fs = memoryArtifactFs();
  const runtime = createRefreshTestRuntime({ fs, randomHex: () => "1".repeat(24), fetch: async () => { throw new Error("unused"); }, clock: () => undefined, processBoundary: async () => { throw new Error("read-only check reached process authority"); } });
  await runtime.runCli({ argv: ["--check-failure-report=absent", `--revision=${revision}`], output: { write(value) { writes.push(value); } } });
  assert.deepEqual(writes, [`REFRESH FAILURE REPORT ABSENT ${revision}\n`]);
  assert.equal(runtime.calls.length, 0);
  for (const argv of [[`--revision=${revision}`, "--check-failure-report=absent"], ["--check-failure-report=absent"], ["--check-failure-report=absent", `--revision=${revision}`, "extra"], ["--check-failure-report=present", `--revision=${"D".repeat(40)}`]]) {
    await assert.rejects(runtime.runCli({ argv }), /failure report|exact|revision/i);
  }
  const durableRuntime = createRefreshTestRuntime({ fs: memoryArtifactFs(), randomHex: () => "2".repeat(24), fetch: async () => { throw new Error("unused"); }, clock: () => undefined, processBoundary: async () => { throw new Error("read-only check reached process authority"); } });
  const durable = durableRuntime.createAttemptStore();
  const claim = await durable.claimRefreshAttempt(revision);
  const published = await durable.writeFailureReport({ format: "blog-x-local-refresh-failure", version: 1, implementationRevision: revision, claimSha256: claim.sha256, stage: "schema-verify", errorClass: "error", baseline: "applicable", recollection: "failed", preservation: "unproved", facts: { preflight: "a".repeat(64), current: null, rollback: null } });
  const presentOutput = [];
  await durableRuntime.runCli({ argv: ["--check-failure-report=present", `--revision=${revision}`], output: { write(value) { presentOutput.push(value); } } });
  assert.deepEqual(presentOutput, [`REFRESH FAILURE REPORT PRESENT ${revision} ${published.sha256}\n`]);
  assert.equal(durableRuntime.calls.length, 0);
});

test("production factories are sealed while test core exposes raw boundaries but no fact or probe injection", async () => {
  const live = await import("./refresh-local-live.mjs");
  assert.equal(live.createProductionLiveRefreshAdapter.length, 0);
  assert.equal(live.createProductionRefreshAttemptStore.length, 0);
  assert.equal(live.verifyProductionLiveRefreshEvidence.length, 0);
  assert.throws(() => live.createProductionLiveRefreshAdapter({ collectFacts: async () => ({}) }), /argument|sealed|override/i);
  assert.throws(() => live.verifyProductionLiveRefreshEvidence({ collectFacts: async () => ({}) }), /argument|sealed|override/i);
  const testCore = await import("./refresh-local-test-core.mjs");
  const runtime = testCore.createRefreshTestRuntime({ processBoundary: async () => ({ stdout: "" }), fs: memoryArtifactFs(), fetch: async () => { throw new Error("fake"); }, clock: () => "2026-08-16T00:00:00.000Z", randomHex: () => "1".repeat(24) });
  assert.equal("collectFacts" in runtime, false);
  assert.equal("probeTargets" in runtime, false);
});

test("test core traces production Git and PostgreSQL sources from raw boundary output", async () => {
  const revision = "a".repeat(40); const calls = [];
  const fs = memoryArtifactFs();
  fs.entries.set("/virtual-workspace/pnpm-lock.yaml", { kind: "file", bytes: "raw-lock\n", uid: TEST_UID, mode: 0o600 });
  const runtime = (await import("./refresh-local-test-core.mjs")).createRefreshTestRuntime({
    fs, fetch: async () => { throw new Error("unused"); }, clock: () => "2026-08-16T00:00:00.000Z", randomHex: () => "1".repeat(24),
    async processBoundary(command, args) {
      calls.push([command, args]);
      if (command === "git" && args[0] === "status") return { stdout: "" };
      if (command === "git" && args[0] === "symbolic-ref") return { stdout: "refs/heads/dev\n" };
      if (command === "git" && args[0] === "rev-parse") return { stdout: `${revision}\n` };
      if (args.at(-1).includes?.("current_database")) return { stdout: '{"name":"blog_x","systemIdentifier":"system-1"}\n' };
      if (args.at(-1).includes?.("information_schema.columns")) return { stdout: '[["schema-row"]]\n' };
      throw new Error(`unexpected fake argv ${command} ${args.join(" ")}`);
    },
  });
  const sources = runtime.createFactSources();
  assert.equal((await sources.git()).implementationRevision, revision);
  assert.deepEqual(await sources.database(), { name: "blog_x", systemIdentifier: "system-1", schemaRows: 1, schemaSha256: factsSha256([["schema-row"]]) });
  assert.deepEqual(calls.slice(0, 3), [["git", ["status", "--porcelain"]], ["git", ["symbolic-ref", "--quiet", "HEAD"]], ["git", ["rev-parse", "HEAD"]]]);
  assert.equal(calls.slice(3).every(([command, args]) => command === "docker-compose" && args.slice(0, 4).join(" ") === "-p blogxlocal -f compose.yaml"), true);
});

test("route collection rejects redirects and final URL drift with redirect:error", async () => {
  const calls = [];
  const sources = testRuntime(memoryArtifactFs(), undefined, async () => ({ stdout: "" }), async (url, options) => { calls.push({ url, options }); return { status: 200, url: url.replace("127.0.0.1", "localhost"), async text() { return "<html></html>"; } }; }).createFactSources();
  await assert.rejects(sources.routes(), /redirect|final URL|origin/i);
  assert.deepEqual(calls[0].options, { redirect: "error" });
});

test("route collection records stale HTML and JSON API observations by declared media type", async () => {
  const inverse = structuredClone(staleRouteResponses);
  inverse["/api/public/search?q="] = { status: 404, body: JSON.stringify({ error: "old_search" }), contentType: "Application/Problem+JSON ; charset=utf-8" };
  inverse["/api/public/articles/phase6-unknown/related"] = { status: 404, body: "<html>legacy related route missing</html>", contentType: "TEXT/HTML; charset=utf-8" };

  for (const responses of [staleRouteResponses, inverse]) {
    const calls = [];
    const sources = testRuntime(memoryArtifactFs(), undefined, async () => ({ stdout: "" }), async (url, options) => {
      calls.push({ url, options });
      const path = url.slice("http://127.0.0.1:3100".length);
      return fakeRouteResponse(url, responses[path]);
    }).createFactSources();
    const routes = await sources.routes();
    assert.equal(routes["/api/public/search?q="].status, 404);
    assert.equal(routes["/api/public/articles/phase6-unknown/related"].status, 404);
    assert.equal(Object.hasOwn(routes["/api/public/search?q="], "body"), responses["/api/public/search?q="].contentType.toLowerCase().includes("json"));
    assert.equal(Object.hasOwn(routes["/api/public/articles/phase6-unknown/related"], "body"), responses["/api/public/articles/phase6-unknown/related"].contentType.toLowerCase().includes("json"));
    assert.equal(calls.length, 8);
    assert.equal(calls.every(({ options }) => options.redirect === "error"), true);
  }

  const malformed = structuredClone(finalRouteResponses);
  malformed["/api/health"] = { status: 200, body: "{not-json", contentType: "application/json" };
  const sources = testRuntime(memoryArtifactFs(), undefined, async () => ({ stdout: "" }), async (url) => {
    const path = url.slice("http://127.0.0.1:3100".length);
    return fakeRouteResponse(url, malformed[path]);
  }).createFactSources();
  await assert.rejects(sources.routes(), /malformed JSON|route|health/i);
});

test("route collection fetches plural archives exactly once and never requests singular authority", async () => {
  const calls = [];
  const singularArchive = "/archives".slice(0, -1);
  const sources = testRuntime(memoryArtifactFs(), undefined, async () => ({ stdout: "" }), async (url, options) => {
    calls.push({ url, options });
    const path = url.slice("http://127.0.0.1:3100".length);
    return fakeRouteResponse(url, finalRouteResponses[path] ?? { status: 200, body: "<html>unexpected route</html>", contentType: "text/html" });
  }).createFactSources();
  const routes = await sources.routes();
  const paths = calls.map(({ url }) => new URL(url).pathname);
  assert.equal(paths.filter((path) => path === "/archives").length, 1);
  assert.equal(paths.includes(singularArchive), false);
  assert.equal(Object.hasOwn(routes, "/archives"), true);
  assert.equal(Object.hasOwn(routes, singularArchive), false);
  assert.equal(calls.every(({ options }) => options.redirect === "error"), true);
});

test("representative reading collection is bounded, strict, same-origin and read-only for populated and empty sets", async () => {
  const collect = (listBody, overrides = {}) => testRuntime(memoryArtifactFs(), undefined, async () => ({ stdout: "" }), async (url, options) => {
    const path = url.slice("http://127.0.0.1:3100".length);
    if (path === "/api/public/articles?page=1") return fakeRouteResponse(overrides.listUrl ?? url, { status: overrides.listStatus ?? 200, body: listBody, contentType: "application/json" });
    assert.equal(path, `/posts/${encodeURIComponent(publicListItem.slug)}`);
    return fakeRouteResponse(overrides.detailUrl ?? url, { status: overrides.detailStatus ?? 200, body: overrides.detailBody ?? "<html>post</html>", contentType: "text/html" });
  }).createFactSources().reading();

  assert.deepEqual(await collect(publicListBody), verifiedReading);
  assert.deepEqual(await collect(emptyPublicListBody), emptyReading);
  const duplicate = JSON.stringify({ page: 1, pageSize: 10, totalItems: 2, totalPages: 1, items: [publicListItem, publicListItem] });
  const extra = JSON.stringify({ ...JSON.parse(publicListBody), internal: true });
  for (const operation of [
    () => collect(duplicate),
    () => collect(extra),
    () => collect("{not-json"),
    () => collect(publicListBody, { listUrl: "http://localhost:3100/api/public/articles?page=1" }),
    () => collect(publicListBody, { detailStatus: 302 }),
    () => collect("x".repeat(1_048_577)),
  ]) await assert.rejects(operation(), /reading|list|duplicate|JSON|redirect|status|bound|key/i);
});

test("claim publication treats temporary unlink failure as terminal even after final link", async () => {
  const fs = memoryClaimFs(); const originalUnlink = fs.unlink;
  fs.unlink = async (path) => { if (path.endsWith(".tmp")) throw Object.assign(new Error("unlink fault"), { code: "EIO" }); return originalUnlink(path); };
  const store = testRuntime(fs, () => "9".repeat(24)).createAttemptStore();
  await assert.rejects(store.claimRefreshAttempt("e".repeat(40)), /unlink|EIO|publication/i);
});

test("local Docker authority accepts only approved Unix contexts and child environment is minimal", async () => {
  const testCore = await import("./refresh-local-test-core.mjs");
  const allowed = testCore.assertLocalDockerAuthority("colima", [{ Name: "colima", Endpoints: { docker: { Host: "unix:///Users/test/.colima/default/docker.sock" } } }], { uid: 501, home: "/Users/test" });
  assert.equal(allowed.socket, "/Users/test/.colima/default/docker.sock");
  for (const host of ["tcp://127.0.0.1:2375", "ssh://host", "https://daemon", "unix:///tmp/other.sock"]) assert.throws(() => testCore.assertLocalDockerAuthority("colima", [{ Name: "colima", Endpoints: { docker: { Host: host } } }], { uid: 501, home: "/Users/test" }), /local|unix|socket|authority/i);
  assert.throws(() => testCore.buildMinimalChildEnvironment({ PATH: "/bin", HOME: "/Users/test", TMPDIR: "/tmp", LANG: "C", DOCKER_HOST: "tcp://remote" }), /DOCKER_HOST|override/i);
  assert.deepEqual(Object.keys(testCore.buildMinimalChildEnvironment({ PATH: "/bin", HOME: "/Users/test", TMPDIR: "/tmp", LANG: "C", SECRET: "no" })).sort(), ["HOME", "LANG", "PATH", "TMPDIR"]);
  const socketFs = { async lstat() { return { isSocket: () => true, isSymbolicLink: () => false }; }, async realpath(path) { return path; } };
  await assert.doesNotReject(testCore.assertLocalDockerSocket(allowed, socketFs));
  await assert.rejects(testCore.assertLocalDockerSocket(allowed, { ...socketFs, async realpath() { return "/tmp/escaped.sock"; } }), /socket|authority|unsafe/i);
});

test("failure-report presence is cryptographically bound to the canonical real claim", async () => {
  const revision = "8".repeat(40);
  const missing = fakeClaimStore();
  await missing.store.writeFailureReport({ format: "blog-x-local-refresh-failure", version: 1, implementationRevision: revision, claimSha256: "9".repeat(64), stage: "adapter_construction", errorClass: "error", baseline: "not_applicable", recollection: "not_attempted", preservation: "not_applicable_pre_runtime", facts: { preflight: null, current: null, rollback: null } });
  await assert.rejects(missing.store.assertFailureReportPresent(revision), /claim.*absent|claim.*canonical|claim.*digest/i);

  const forged = fakeClaimStore();
  const claim = await forged.store.claimRefreshAttempt(revision);
  await forged.store.writeFailureReport({ format: "blog-x-local-refresh-failure", version: 1, implementationRevision: revision, claimSha256: claim.sha256.replace(/^./, claim.sha256[0] === "a" ? "b" : "a"), stage: "adapter_construction", errorClass: "error", baseline: "not_applicable", recollection: "not_attempted", preservation: "not_applicable_pre_runtime", facts: { preflight: null, current: null, rollback: null } });
  await assert.rejects(forged.store.assertFailureReportPresent(revision), /claim.*digest|bound|mismatch/i);
});

test("production module graph exposes only sealed refresh and verifier assembly", async () => {
  const live = await import("./refresh-local-live.mjs");
  const mainSource = await readFile("scripts/refresh-local.mjs", "utf8");
  const liveSource = await readFile("scripts/refresh-local-live.mjs", "utf8");
  for (const key of ["createLiveRefreshAdapter", "verifyLiveRefreshEvidence", "createRefreshFactSources"]) assert.equal(key in live, false, `${key} must not be a production export`);
  assert.doesNotMatch(mainSource, /revisionResolver|liveAdapterFactory|verifyEvidence\(path, options\)/);
  assert.doesNotMatch(liveSource, /collectFacts|targetProbe|probeTargets/);
  assert.doesNotMatch(liveSource, /refresh-local-test-core/);
});

test("post-claim attachment materialization and recollection failures receive exact terminal stages", async () => {
  for (const stage of ["claim_attachment", "lockfile_plan_materialization"]) {
    const revision = stage === "claim_attachment" ? "7".repeat(40) : "6".repeat(40); const fs = memoryArtifactFs();
    const runtime = createRefreshTestRuntime({ fs, randomHex: () => "6".repeat(24), fetch: async () => { throw new Error("unused"); }, clock(value) { if (value === stage) throw new Error(`${stage} fault`); }, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "symbolic-ref" ? "refs/heads/dev\n" : command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
    await assert.rejects(runtime.runCli(), new RegExp(stage));
    const claim = await runtime.inspectClaim(revision); const report = await runtime.createAttemptStore().assertFailureReportPresent(revision);
    assert.equal(report.report.stage, stage);
    assert.equal(report.report.claimSha256, claim.sha256);
    assert.equal(report.report.preservation, "not_applicable_pre_runtime");
  }

  const fixture = liveFixture({ failPostCutover: true, recollectionFault: true });
  await assert.rejects(fixture.runtime.runCli(), /failure_recollection/i);
  const report = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
  assert.equal(report.report.stage, "failure_recollection");
  assert.equal(report.report.recollection, "failed");
  assert.equal(report.report.preservation, "unproved");

  assert.match(await mainSourceForStageAudit(), /lockfile_plan_materialization/);
});

async function mainSourceForStageAudit() {
  return readFile("scripts/refresh-local-runtime-core.mjs", "utf8");
}

test("post-link claim and report faults use artifact-specific unrecoverable invariants", async () => {
  for (const artifact of ["claim", "failure-report"]) {
    const fs = memoryClaimFs(); const originalUnlink = fs.unlink;
    const store = testRuntime(fs, () => "4".repeat(24)).createAttemptStore();
    const revision = artifact === "claim" ? "4".repeat(40) : "5".repeat(40);
    if (artifact === "claim") {
      fs.unlink = async (path) => { if (path.endsWith(".tmp")) throw Object.assign(new Error("unlink fault"), { code: "EIO" }); return originalUnlink(path); };
      await assert.rejects(store.claimRefreshAttempt(revision), /UNRECOVERABLE_CLAIM_INVARIANT:EIO/);
    }
    else {
      const claim = await store.claimRefreshAttempt(revision);
      fs.unlink = async (path) => { if (path.endsWith(".tmp")) throw Object.assign(new Error("unlink fault"), { code: "EIO" }); return originalUnlink(path); };
      await assert.rejects(store.writeFailureReport({ format: "blog-x-local-refresh-failure", version: 1, implementationRevision: revision, claimSha256: claim.sha256, stage: "write-evidence", errorClass: "error", baseline: "applicable", recollection: "failed", preservation: "unproved", facts: { preflight: null, current: null, rollback: null } }), /UNRECOVERABLE_FAILURE_REPORT_INVARIANT:EIO/);
    }
  }
});

test("claim report and evidence atomic writers cover every operation and cleanup site", async () => {
  const sites = ["temp_open", "write", "file_sync", "file_close", "link", "final_validation", "directory_open_1", "directory_sync_1", "directory_close_1", "temp_unlink", "directory_open_2", "directory_sync_2", "directory_close_2", "cleanup_unlink", "cleanup_sync"];
  for (const artifact of ["claim", "failure-report", "evidence"]) {
    for (const site of sites) {
      const revision = artifact === "claim" ? "1".repeat(40) : artifact === "failure-report" ? "2".repeat(40) : "a".repeat(40);
      let finalPath; let operation; let entries;
      if (artifact === "claim") {
        const base = memoryClaimFs(); const fs = atomicFaultFs(base, artifact, site); entries = base.entries;
        const store = testRuntime(fs, () => "7".repeat(24)).createAttemptStore(); finalPath = store.pathFor(revision);
        operation = () => store.claimRefreshAttempt(revision);
      } else if (artifact === "failure-report") {
        const base = memoryClaimFs(); const claimStore = testRuntime(base, () => "7".repeat(24)).createAttemptStore(); const claim = await claimStore.claimRefreshAttempt(revision);
        const fs = atomicFaultFs(base, artifact, site); entries = base.entries;
        const store = testRuntime(fs, () => "8".repeat(24)).createAttemptStore(); finalPath = store.failurePathFor(revision);
        operation = () => store.writeFailureReport({ format: "blog-x-local-refresh-failure", version: 1, implementationRevision: revision, claimSha256: claim.sha256, stage: "write-evidence", errorClass: "error", baseline: "applicable", recollection: "failed", preservation: "unproved", facts: { preflight: null, current: null, rollback: null } });
      } else {
        const fixture = liveFixture({ atomicFault: site }); entries = fixture.evidenceFs.entries; finalPath = `/virtual-workspace/${TEST_EVIDENCE_PATH}`;
        operation = () => runLocalRefresh({ adapter: fixture.adapter, plan: fixture.plan });
      }
      await assert.rejects(operation(), new RegExp(`UNRECOVERABLE_${artifact.toUpperCase().replace("-", "_")}_INVARIANT:EIO`), `${artifact}:${site}`);
      assert.equal(entries.has(finalPath), site === "cleanup_unlink", `${artifact}:${site} final-state truth`);
    }
  }
});

test("every exact post-claim terminal stage retains the canonical claim and a bound report or invariant", async () => {
  const earlyStages = ["adapter_construction", "claim_attachment", "lockfile_plan_materialization"];
  for (const stage of earlyStages) {
    const revision = stage[0].charCodeAt(0).toString(16).padStart(40, "0"); const fs = memoryArtifactFs();
    const runtime = createRefreshTestRuntime({ fs, randomHex: () => "5".repeat(24), fetch: async () => { throw new Error("unused"); }, clock(value) { if (value === stage) throw new Error(`${stage} fault`); }, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "symbolic-ref" ? "refs/heads/dev\n" : command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
    await assert.rejects(runtime.runCli(), new RegExp(stage));
    const claim = await runtime.inspectClaim(revision); const report = await runtime.createAttemptStore().assertFailureReportPresent(revision);
    assert.equal(report.report.stage, stage); assert.equal(report.report.claimSha256, claim.sha256); assert.equal(report.report.preservation, "not_applicable_pre_runtime");
  }

  for (const stage of ["local_docker_authority", "preflight_collection", "build-api", "build-web", "migrate", "schema-verify", "cutover-api-web", "routes", "release-blocked", "write-evidence"]) {
    const fixture = liveFixture({ stageFaults: [stage] });
    await assert.rejects(fixture.runtime.runCli(), new RegExp(stage));
    const claim = await fixture.runtime.inspectClaim(fixture.revision); const report = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
    assert.equal(report.report.stage, stage, stage); assert.equal(report.report.claimSha256, claim.sha256, stage);
    assert.doesNotMatch(report.bytes, /postgres:\/\/|Mountpoint|relativePath|migration_fingerprint|environment|command|private\/var/i);
  }

  for (const stage of ["rollback-api-web", "verify-rollback"]) {
    const fixture = liveFixture({ failPostCutover: true, stageFaults: [stage] });
    await assert.rejects(fixture.runtime.runCli(), new RegExp(stage));
    const report = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
    assert.equal(report.report.stage, stage);
  }

  const recollection = liveFixture({ failPostCutover: true, recollectionFault: true });
  await assert.rejects(recollection.runtime.runCli(), /failure_recollection/i);
  assert.equal((await recollection.runtime.createAttemptStore().assertFailureReportPresent(recollection.revision)).report.stage, "failure_recollection");

  const revision = "9".repeat(40); const fs = memoryArtifactFs();
  const reportFault = createRefreshTestRuntime({ fs, randomHex: () => "9".repeat(24), fetch: async () => { throw new Error("unused"); }, clock(stage) { if (["adapter_construction", "failure_report_publication"].includes(stage)) throw Object.assign(new Error(`${stage} fault`), { code: "EIO" }); }, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "symbolic-ref" ? "refs/heads/dev\n" : command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
  await assert.rejects(reportFault.runCli(), /failure_report_publication/);
  await assert.doesNotReject(reportFault.inspectClaim(revision));
  await assert.rejects(reportFault.createAttemptStore().assertFailureReportPresent(revision), /failure report|authority|absent/i);

  const claimBase = memoryArtifactFs(); const claimFaultFs = atomicFaultFs(claimBase, "claim", "temp_open");
  const claimFailure = createRefreshTestRuntime({ fs: claimFaultFs, randomHex: () => "8".repeat(24), fetch: async () => { throw new Error("unused"); }, clock: () => undefined, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "symbolic-ref" ? "refs/heads/dev\n" : command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
  await assert.rejects(claimFailure.runCli(), /attempt_claim_publication/);
  assert.equal([...claimBase.entries.keys()].some((path) => path.endsWith(".failure.json")), false);
});
