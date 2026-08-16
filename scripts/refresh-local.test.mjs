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
  assertFixedRuntimeAuthority,
  assertPersistenceTransition,
  collectRefreshFacts,
  factsSha256,
  projectSanitizedFacts,
} from "./refresh-local-facts.mjs";

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

function memoryClaimFs(uid = 501) {
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

function memoryArtifactFs(root = "/virtual-workspace") {
  const entries = new Map([
    [root, { kind: "dir", bytes: "", uid: 501, mode: 0o755 }],
    [`${root}/ops`, { kind: "dir", bytes: "", uid: 501, mode: 0o755 }],
    [`${root}/pnpm-lock.yaml`, { kind: "file", bytes: "raw-lock\n", uid: 501, mode: 0o600 }],
    [`${root}/ops/phase5-full-gate-receipt.json`, { kind: "file", bytes: "receipt\n", uid: 501, mode: 0o600 }],
    [`${root}/.planning/phases/06-public-discovery-data/06-VERIFICATION.md`, { kind: "file", bytes: "verified\n", uid: 501, mode: 0o600 }],
    ["/private", { kind: "dir", uid: 0, mode: 0o755 }],
    ["/private/tmp", { kind: "dir", uid: 0, mode: 0o1777 }],
    ["/Users/test/.colima/default/docker.sock", { kind: "socket", uid: 501, mode: 0o600 }],
  ]);
  const error = (code) => Object.assign(new Error(code), { code });
  return {
    entries,
    async lstat(path) { const item = entries.get(path); if (!item) throw error("ENOENT"); return { uid: item.uid, mode: item.mode, isFile: () => item.kind === "file", isDirectory: () => item.kind === "dir", isSocket: () => item.kind === "socket", isSymbolicLink: () => item.kind === "symlink" }; },
    async realpath(path) { if (!entries.has(path)) throw error("ENOENT"); return path; },
    async readdir(path) { if (entries.get(path)?.kind !== "dir") throw error("ENOENT"); return [...entries.keys()].filter((item) => item.startsWith(`${path}/`) && !item.slice(path.length + 1).includes("/")).map((item) => item.slice(path.length + 1)); },
    async mkdir(path, options) { if (entries.has(path)) throw error("EEXIST"); entries.set(path, { kind: "dir", uid: 501, mode: options.mode }); },
    async open(path, flags, mode) {
      if (flags === "wx") { if (entries.has(path)) throw error("EEXIST"); entries.set(path, { kind: "file", bytes: "", uid: 501, mode }); }
      else if (flags !== "r" || entries.get(path)?.kind !== "dir") throw error("ENOENT");
      return { async writeFile(bytes) { entries.get(path).bytes = bytes; }, async sync() {}, async close() {} };
    },
    async link(source, target) { if (entries.has(target)) throw error("EEXIST"); const item = entries.get(source); if (!item) throw error("ENOENT"); entries.set(target, { ...item }); },
    async unlink(path) { if (!entries.delete(path)) throw error("ENOENT"); },
    async readFile(path) { const item = entries.get(path); if (!item) throw error("ENOENT"); return item.bytes; },
  };
}

function atomicFaultFs(base, artifact, site) {
  let active = false; let fired = false; let directorySequence = 0; let cleanup = false;
  const fault = () => { fired = true; throw Object.assign(new Error(`${artifact}:${site}`), { code: "EIO" }); };
  const matches = (path) => artifact === "evidence" ? path.includes("phase6-local-refresh-evidence.json")
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

test("evidence verification is read-only and refuses malformed or non-BLOCKED records", async () => {
  const fs = memoryArtifactFs();
  const path = "/virtual-workspace/ops/phase6-local-refresh-evidence.json";
  fs.entries.set(path, { kind: "file", bytes: JSON.stringify({ format: "blog-x-phase6-local-refresh-evidence", version: 1, implementationRevision: "short", lockfileSha256: "b".repeat(64), releaseState: "READY" }), uid: 501, mode: 0o600 });
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
  assert.doesNotMatch(runtime, /\b(?:ssh|scp|curl)\b/);
});

test("runRefreshCli consumes the raw test runtime only after publishing an absent claim", async () => {
  const fixture = liveFixture();
  const result = await fixture.runtime.runCli();
  assert.equal(result.implementationRevision, fixture.revision);
  assert.match((await fixture.runtime.inspectClaim(fixture.revision)).sha256, /^[a-f0-9]{64}$/);
  assert.ok(fixture.calls.some((call) => call.command === "docker" && call.args[0] === "context"));
  await assert.rejects(fixture.runtime.runCli({ argv: ["--verify-evidence=/tmp/alternate.json"] }), /fixed evidence path/i);
  await assert.rejects(fixture.runtime.runCli({ argv: ["--probe-offline-builds", "extra"] }), /probe option.*exact/i);
});

test("attempt claims are canonical, exclusive, revision-bound, and leave second cli calls before adapter construction", async () => {
  const { fs: storeFs, store } = fakeClaimStore();
  const revision = "f".repeat(40);
  const first = await store.claimRefreshAttempt(revision);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await store.assertPresent(revision)).sha256, first.sha256);
  assert.deepEqual(JSON.parse(first.bytes.trim()), { format: "blog-x-local-refresh-attempt", version: 1, implementationRevision: revision });
  await assert.rejects(store.claimRefreshAttempt(revision), /claimed|exists/i);
  const runtime = createRefreshTestRuntime({ fs: storeFs, randomHex: () => "2".repeat(24), fetch: async () => { throw new Error("unused"); }, clock: () => undefined, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
  await assert.rejects(runtime.runCli(), /claimed|exists/i);
  assert.equal(runtime.calls.filter((call) => call.command === "docker").length, 0);
  await assert.rejects(store.claimRefreshAttempt("F".repeat(40)), /revision/i);
  const live = await import("./refresh-local-live.mjs");
  assert.throws(() => live.createProductionRefreshAttemptStore({ root: "/tmp/blog-x-refresh-attempts" }), /argument|sealed|override/i);
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
  for (const [command, args] of [["docker-compose", ["-p", "other", "down"]], ["docker", ["build", "--network=host"]], ["ssh", ["root@example"]]]) {
    assert.throws(() => assertAllowedRefreshCommand(command, args), /not allowlisted|allowlisted shape|authority|network/i);
  }
});

const SHA = (letter) => `sha256:${letter.repeat(64)}`;
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
  return { Id: `${service}-container`, Image: image, Name: `/${names[service]}`, Config: { Image: `blog-x-${service}-local`, Labels: composeLabels(service) }, State: { Health: { Status: "healthy" } }, NetworkSettings: { Ports: ports } };
}
const volumeFixture = (name) => ({ Name: name, Driver: "local", Mountpoint: `/private/var/lib/${name}`, CreatedAt: "2026-08-15T00:00:00Z", Scope: "local", Labels: { "com.docker.compose.project": "blogxlocal" }, Options: null });
const exactRoutes = {
  "/": { status: 200, bodySha256: "1".repeat(64) },
  "/categories": { status: 200, bodySha256: "2".repeat(64) },
  "/tags": { status: 200, bodySha256: "3".repeat(64) },
  "/archive": { status: 200, bodySha256: "4".repeat(64) },
  "/api/health": { status: 200, body: { ok: true }, bodySha256: "5".repeat(64) },
  "/api/public/search?q=": { status: 200, body: { state: "empty_query", query: "", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] }, bodySha256: "6".repeat(64) },
  "/api/public/articles/phase6-unknown/related": { status: 404, body: { error: "not_found" }, bodySha256: "7".repeat(64) },
};
function factsFixture({ apiImage = SHA("a"), webImage = SHA("w"), phase1 = "2026-08-15T00:00:00.000Z", routes = exactRoutes } = {}) {
  return {
    containers: [inspectContainer("api", apiImage), inspectContainer("postgres", SHA("p")), inspectContainer("web", webImage)],
    volumes: [volumeFixture("blogxlocal_media-data"), volumeFixture("blogxlocal_postgres-data")],
    business: { count: 3, sha256: "a".repeat(64) }, sequences: { count: 2, sha256: "b".repeat(64) },
    ledger: [{ scope: "phase1", migration_count: 7, migration_fingerprint: "fingerprint", applied_at: phase1 }],
    media: { count: 2, bytes: 42, sha256: "c".repeat(64) }, protected: { count: 9, sha256: "d".repeat(64) },
    git: { implementationRevision: "a".repeat(40), clean: true, lockfileSha256: "b".repeat(64) },
    database: { name: "blog_x", systemIdentifier: "1".repeat(32), schemaSha256: "2".repeat(64), schemaRows: 12 },
    seeds: { api: { reference: "blog-x-api-local", inspectedId: SHA("a") }, web: { reference: "blog-x-web-local", inspectedId: SHA("b") } },
    targets: { api: { id: SHA("e"), labelsSha256: "3".repeat(64), filesystemSha256: "4".repeat(64), storeSha256: "5".repeat(64) }, web: { id: SHA("f"), labelsSha256: "6".repeat(64), filesystemSha256: "7".repeat(64), storeSha256: "8".repeat(64) } },
    routes, releaseState: "BLOCKED",
  };
}

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

test("postMigration permits only phase1 timestamp advance and later stages preserve all persistence digests", () => {
  const preflight = factsFixture();
  const postMigration = factsFixture({ phase1: "2026-08-16T00:00:00.000Z" });
  assert.doesNotThrow(() => assertPersistenceTransition(preflight, postMigration, { stage: "postMigration" }));
  assert.throws(() => assertPersistenceTransition(preflight, factsFixture(), { stage: "postMigration" }), /phase1|advance/i);
  const drift = structuredClone(postMigration); drift.media.sha256 = "e".repeat(64);
  assert.throws(() => assertPersistenceTransition(postMigration, drift, { stage: "postCutover", targetImageIds: { api: SHA("n"), web: SHA("x") } }), /media|persistence/i);
});

test("sanitized v4 fact projection contains digests and counts but no raw rows, paths, mounts, env or commands", () => {
  const projection = projectSanitizedFacts(factsFixture());
  const bytes = JSON.stringify(projection);
  assert.deepEqual(Object.keys(projection).sort(), ["business", "containers", "database", "git", "ledger", "media", "protected", "releaseState", "routes", "seeds", "sequences", "targets", "topology", "volumes"].sort());
  assert.doesNotMatch(bytes, /Mountpoint|relativePath|migration_fingerprint|applied_at|environment|command|private\/var/i);
});

test("command policy is exact-token and rejects extra, reordered, alternate authority and mutable rollback refs", () => {
  const revision = "a".repeat(40);
  const valid = ["docker", ["build", "--network=none", "--pull=false", "--file", "apps/api/Dockerfile.refresh", "--tag", `blog-x-api-local:${revision.slice(0, 12)}`, "--build-arg", `SEED_IMAGE=${SHA("c")}`, "--build-arg", `SEED_IMAGE_ID=${SHA("c")}`, "--build-arg", `REFRESH_REVISION=${revision}`, "--build-arg", `LOCKFILE_SHA256=${"b".repeat(64)}`, "--build-arg", "PUBLIC_ORIGIN=http://127.0.0.1:3100", "."]];
  assert.doesNotThrow(() => assertAllowedRefreshCommand(...valid));
  for (const args of [[...valid[1], "extra"], ["build", "--pull=false", "--network=none", ...valid[1].slice(3)], valid[1].map((value) => value === "PUBLIC_ORIGIN=http://127.0.0.1:3100" ? "PUBLIC_ORIGIN=http://0.0.0.0:3100" : value)]) {
    assert.throws(() => assertAllowedRefreshCommand("docker", args), /allowlisted|exact|argv/i);
  }
});

test("collector uses fake argv/database/media/history adapters and rejects partial route bodies", async () => {
  const fixture = factsFixture();
  const calls = [];
  const collected = await collectRefreshFacts({
    sources: {
      async composeAuthority() { calls.push("compose"); return { services: ["api", "postgres", "web"], ps: ["api", "postgres", "web"] }; },
      async containers() { calls.push("containers"); return fixture.containers; },
      async volumes() { calls.push("volumes"); return fixture.volumes; },
      async business() { calls.push("database"); return fixture.business; },
      async sequences() { return fixture.sequences; }, async ledger() { return fixture.ledger; },
      async media() { calls.push("media"); return fixture.media; }, async protected() { calls.push("history"); return fixture.protected; },
      async routes() { return fixture.routes; }, async releaseState() { return "BLOCKED"; },
      async git() { return fixture.git; }, async database() { return fixture.database; }, async seeds() { return fixture.seeds; }, async targets() { return fixture.targets; },
    },
  });
  assert.deepEqual(calls, ["compose", "containers", "volumes", "database", "media", "history"]);
  assertFixedRuntimeAuthority(collected);
  const bad = structuredClone(fixture.routes); bad["/api/public/search?q="].body = { state: "empty_query" };
  await assert.rejects(collectRefreshFacts({ sources: { composeAuthority: async () => ({ services: ["api", "postgres", "web"], ps: ["api", "postgres", "web"] }), containers: async () => fixture.containers, volumes: async () => fixture.volumes, business: async () => fixture.business, sequences: async () => fixture.sequences, ledger: async () => fixture.ledger, media: async () => fixture.media, protected: async () => fixture.protected, routes: async () => bad, releaseState: async () => "BLOCKED", git: async () => fixture.git, database: async () => fixture.database, seeds: async () => fixture.seeds, targets: async () => fixture.targets } }), /route|search|contract/i);
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
  for (const psStdout of [JSON.stringify(COMPOSE_V5_PS_RECORDS), COMPOSE_V5_PS_NDJSON, COMPOSE_V5_PS_NDJSON.replaceAll("\n", "\r\n")]) {
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
    `${JSON.stringify(COMPOSE_V5_PS_RECORDS)}\n${first}`, `${first}\nnot-json`, `${first} trailing-garbage`,
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
  return { Id: id, Config: { Image: `blog-x-${app}-local:${revision.slice(0, 12)}`, WorkingDir: "/refresh-workspace", Cmd: ["corepack", "pnpm", "--filter", `@blog-x/${app}`, "start"], Labels: { "org.opencontainers.image.revision": revision, "io.blog-x.lockfile-sha256": lock, "io.blog-x.seed-image-id": seedId, "io.blog-x.application": app, "io.blog-x.public-origin": "http://127.0.0.1:3100", "io.blog-x.refresh-kind": "phase6-offline" } } };
}

function liveFixture({ failPostCutover = false, recollectionFault = false, stageFaults = [], atomicFault } = {}) {
  const revision = "a".repeat(40); const lock = createHash("sha256").update("raw-lock\n").digest("hex");
  const old = { api: SHA("a"), web: SHA("b") }; const targetIds = { api: SHA("e"), web: SHA("f") };
  const plan = createRefreshPlan({ revision, lockSha256: lock, apiSeedId: old.api, webSeedId: old.web });
  const targets = { api: targetImage("api", targetIds.api, revision, lock, old.api), web: targetImage("web", targetIds.web, revision, lock, old.web) };
  const calls = []; let snapshot = 0; let rolledBack = false; let verificationMode = false;
  const routeBodies = {
    "/": "<html>home</html>", "/categories": "<html>categories</html>", "/tags": "<html>tags</html>", "/archive": "<html>archive</html>",
    "/api/health": JSON.stringify({ ok: true }),
    "/api/public/search?q=": JSON.stringify({ state: "empty_query", query: "", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] }),
    "/api/public/articles/phase6-unknown/related": JSON.stringify({ error: "not_found" }),
  };
  const runner = async (command, args, options = {}) => {
    calls.push({ command, args: [...args], options: structuredClone(options) });
    if (command === "docker" && args[0] === "context" && args[1] === "show") return { stdout: "colima\n" };
    if (command === "docker" && args[0] === "context" && args[1] === "inspect") return { stdout: JSON.stringify([{ Name: "colima", Endpoints: { docker: { Host: "unix:///Users/test/.colima/default/docker.sock" } } }]) };
    if (command === "docker" && args[0] === "image" && args[1] === "inspect") {
      const ref = args[2];
      if (ref === "blog-x-api-local" || ref === old.api) return { stdout: JSON.stringify([{ Id: old.api }]) };
      if (ref === "blog-x-web-local" || ref === old.web) return { stdout: JSON.stringify([{ Id: old.web }]) };
      if (ref === plan.targets[0].tag) return { stdout: JSON.stringify([targets.api]) };
      if (ref === plan.targets[1].tag) return { stdout: JSON.stringify([targets.web]) };
      if (ref === targetIds.api) return { stdout: JSON.stringify([targets.api]) };
      if (ref === targetIds.web) return { stdout: JSON.stringify([targets.web]) };
    }
    if (command === "docker" && args[0] === "container" && args.length === 5) {
      snapshot += 1;
      const live = snapshot >= 3 && !rolledBack && (!failPostCutover || snapshot === 3) ? targetIds : old;
      return { stdout: JSON.stringify([inspectContainer("postgres", SHA("p")), inspectContainer("api", live.api), inspectContainer("web", live.web)]) };
    }
    if (command === "docker" && args[0] === "container") return { stdout: JSON.stringify([{ Image: targetIds.api, Config: { Image: plan.targets[0].tag, Labels: composeLabels("api", "True") } }]) };
    if (command === "docker" && args[0] === "volume") return { stdout: JSON.stringify([volumeFixture("blogxlocal_postgres-data"), volumeFixture("blogxlocal_media-data")]) };
    if (command === "docker" && args[0] === "run" && args.includes("corepack")) return { stdout: "/pnpm-store/v10\n" };
    if (command === "docker") return { stdout: "" };
    if (command === "docker-compose") {
      const joined = args.join(" "); const sql = args.at(-1);
      if (args.includes("up") && options.env?.BLOG_X_API_IMAGE === old.api) rolledBack = true;
      if (joined.endsWith("config --services")) return { stdout: "api\npostgres\nweb\n" };
      if (joined.endsWith("ps --all --format json")) return { stdout: JSON.stringify([{ Service: "api" }, { Service: "postgres" }, { Service: "web" }]) };
      if (args.includes("pg_dump")) return { stdout: "1\tarticle\n2\tarticle\n" };
      if (typeof sql === "string" && sql.includes("pg_sequences")) return { stdout: JSON.stringify([{ schemaname: "public", sequencename: "articles_id_seq", last_value: 3 }]) };
      if (typeof sql === "string" && sql.includes("blog_x_schema_ledger")) return { stdout: JSON.stringify([{ scope: "phase1", migration_count: 7, migration_fingerprint: "stable", applied_at: snapshot >= 2 ? "2026-08-16T00:00:00.000Z" : "2026-08-15T00:00:00.000Z" }]) };
      if (typeof sql === "string" && sql.includes("current_database")) return { stdout: JSON.stringify({ name: "blog_x", systemIdentifier: "system-1" }) };
      if (typeof sql === "string" && sql.includes("information_schema.columns")) return { stdout: JSON.stringify([["column", "articles.id", "bigint:NO"]]) };
      if (args.includes("api") && args.includes("node") && args.includes("-e")) return { stdout: JSON.stringify(failPostCutover && snapshot === 3 ? [{ relativePath: "asset", bytes: 8, sha256: "9".repeat(64) }] : [{ relativePath: "asset", bytes: 7, sha256: "8".repeat(64) }]) };
      return { stdout: "" };
    }
    if (command === "git" && args[0] === "status") return { stdout: "" };
    if (command === "git" && args[0] === "rev-parse") return { stdout: `${verificationMode ? "c".repeat(40) : revision}\n` };
    if (command === "git" && args[0] === "ls-files") return { stdout: "" };
    if (command === "git" && args[0] === "show") return { stdout: "raw-lock\n" };
    if (command === "git" && args[0] === "merge-base") return { stdout: "" };
    if (command === "git" && args[0] === "diff") return { stdout: "ops/phase6-local-refresh-evidence.json\n" };
    if (command === "node") return { stdout: "" };
    throw new Error(`unexpected raw fake argv: ${command} ${args.join(" ")}`);
  };
  const evidenceBaseFs = memoryArtifactFs();
  const evidenceFs = atomicFault ? atomicFaultFs(evidenceBaseFs, "evidence", atomicFault) : evidenceBaseFs;
  const fetch = async (url) => { const path = url.slice("http://127.0.0.1:3100".length); const body = routeBodies[path]; return { status: path.endsWith("/related") ? 404 : 200, url, async text() { return body; } }; };
  const runtime = createRefreshTestRuntime({ processBoundary: runner, fs: evidenceFs, fetch, clock(stage) { if (recollectionFault && stage === "failure_recollection" || stageFaults.includes(stage)) throw new Error(`${stage} fault`); }, randomHex: () => "3".repeat(24) });
  const adapter = runtime.createAdapter();
  return { adapter, calls, evidenceFs, old, plan, revision, targetIds, runtime, beginVerification() { verificationMode = true; } };
}

test("complete fake live refresh uses target API one-off, immutable cutover and sanitized atomic v4 evidence", async () => {
  const fixture = liveFixture();
  await runLocalRefresh({ adapter: fixture.adapter, plan: fixture.plan });
  const oneoff = `blogxlocal-api-refresh-${fixture.revision.slice(0, 12)}`;
  const migration = fixture.calls.find((call) => call.command === "docker" && call.args.includes("db:migrate"));
  const schema = fixture.calls.find((call) => call.command === "docker" && call.args.includes("db:schema:verify"));
  assert.equal(migration.args[1], oneoff); assert.equal(schema.args[1], oneoff);
  assert.ok(fixture.calls.some((call) => call.command === "docker-compose" && call.args.includes("run") && call.options.env.BLOG_X_API_IMAGE === fixture.plan.targets[0].tag));
  assert.ok(fixture.calls.some((call) => call.command === "docker-compose" && call.args.includes("up") && call.options.env.BLOG_X_API_IMAGE === fixture.targetIds.api && call.options.env.BLOG_X_WEB_IMAGE === fixture.targetIds.web));
  const bytes = await fixture.evidenceFs.readFile("/virtual-workspace/ops/phase6-local-refresh-evidence.json");
  const evidence = JSON.parse(bytes);
  assert.equal(evidence.version, 4); assert.equal(evidence.releaseState, "BLOCKED");
  assert.doesNotMatch(bytes, /Mountpoint|relativePath|migration_fingerprint|applied_at|environment|command|private\/var/i);
  assert.equal([...fixture.evidenceFs.entries.keys()].some((path) => path.endsWith(".tmp")), false);
  assert.deepEqual(fixture.calls.filter((call) => call.command === "docker" && call.args[0] === "rm").map((call) => call.args), [["rm", "-f", oneoff]]);
  fixture.beginVerification();
  assert.equal((await fixture.runtime.verifyEvidence("/virtual-workspace/ops/phase6-local-refresh-evidence.json")).releaseState, "BLOCKED");
  assert.equal(await fixture.evidenceFs.readFile("/virtual-workspace/ops/phase6-local-refresh-evidence.json"), bytes);
  assert.ok(fixture.calls.some((call) => call.command === "git" && call.args[0] === "show"));
  assert.ok(fixture.calls.some((call) => call.command === "git" && call.args[0] === "merge-base"));
  assert.ok(fixture.calls.some((call) => call.command === "git" && call.args[0] === "diff"));
  assert.ok(fixture.runtime.reads.includes("/virtual-workspace/pnpm-lock.yaml"));
  assert.ok(fixture.runtime.reads.includes("/virtual-workspace/ops/phase5-full-gate-receipt.json"));
  assert.ok(fixture.calls.some((call) => call.command === "docker" && call.args.join(" ") === "image inspect blog-x-api-local"));
  assert.ok(fixture.calls.some((call) => call.command === "docker" && call.args.join(" ") === `image inspect ${fixture.targetIds.api}`));
  assert.equal(fixture.runtime.fetches.length >= 14, true);
  fixture.evidenceFs.entries.get("/virtual-workspace/ops/phase5-full-gate-receipt.json").bytes = "raw drift\n";
  await assert.rejects(fixture.runtime.verifyEvidence("/virtual-workspace/ops/phase6-local-refresh-evidence.json"), /drift/i);
});

test("post-cutover fact failure rolls back API/Web by immutable IDs and suppresses evidence", async () => {
  const fixture = liveFixture({ failPostCutover: true });
  await assert.rejects(runLocalRefresh({ adapter: fixture.adapter, plan: fixture.plan }), /media|persistence/i);
  const cutovers = fixture.calls.filter((call) => call.command === "docker-compose" && call.args.includes("up"));
  assert.deepEqual(cutovers.map((call) => call.options.env), [
    { BLOG_X_API_IMAGE: fixture.targetIds.api, BLOG_X_WEB_IMAGE: fixture.targetIds.web },
    { BLOG_X_API_IMAGE: fixture.old.api, BLOG_X_WEB_IMAGE: fixture.old.web },
  ]);
  await assert.rejects(fixture.evidenceFs.readFile("/virtual-workspace/ops/phase6-local-refresh-evidence.json"), /ENOENT/);
  assert.equal(fixture.calls.some((call) => call.args.includes("down") || call.args.includes("postgres") && call.args[0] === "rm" || call.command === "docker" && call.args[0] === "volume" && call.args[1] !== "inspect"), false);
});

test("v4 projection is revision and schema complete with row-addressed sanitized ledger transitions", () => {
  const facts = factsFixture();
  facts.git = { implementationRevision: "a".repeat(40), clean: true, lockfileSha256: "b".repeat(64) };
  facts.database = { name: "blog_x", systemIdentifier: "1".repeat(32), schemaSha256: "2".repeat(64), schemaRows: 12 };
  facts.seeds = { api: { reference: "blog-x-api-local", inspectedId: SHA("a") }, web: { reference: "blog-x-web-local", inspectedId: SHA("b") } };
  facts.targets = { api: { id: SHA("e"), labelsSha256: "3".repeat(64), filesystemSha256: "4".repeat(64), storeSha256: "5".repeat(64) }, web: { id: SHA("f"), labelsSha256: "6".repeat(64), filesystemSha256: "7".repeat(64), storeSha256: "8".repeat(64) } };
  facts.ledger.push({ scope: "phase5", migration_count: 2, migration_fingerprint: "secret-fingerprint", applied_at: "2026-08-15T00:00:00.000Z" });
  const projection = projectSanitizedFacts(facts);
  assert.deepEqual(Object.keys(projection.git).sort(), ["clean", "implementationRevision", "lockfileSha256"]);
  assert.deepEqual(Object.keys(projection.database).sort(), ["name", "schemaRows", "schemaSha256", "systemIdentifier"]);
  assert.deepEqual(Object.keys(projection.ledger.rows).sort(), ["phase1", "phase5"]);
  assert.deepEqual(Object.keys(projection.ledger.rows.phase1).sort(), ["appliedAt", "stableSha256"]);
  assert.doesNotMatch(JSON.stringify(projection), /secret-fingerprint|migration_fingerprint/);
});

test("empty argv publishes claim before adapter construction and every later failure writes a durable report", async () => {
  const revision = "c".repeat(40); const fs = memoryArtifactFs();
  const runtime = createRefreshTestRuntime({ fs, randomHex: () => "d".repeat(24), fetch: async () => { throw new Error("unused"); }, clock(stage) { if (stage === "adapter_construction") throw new Error("daemon rejected"); }, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
  await assert.rejects(runtime.runCli(), /daemon rejected/);
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
  fs.entries.set("/virtual-workspace/pnpm-lock.yaml", { kind: "file", bytes: "raw-lock\n", uid: 501, mode: 0o600 });
  const runtime = (await import("./refresh-local-test-core.mjs")).createRefreshTestRuntime({
    fs, fetch: async () => { throw new Error("unused"); }, clock: () => "2026-08-16T00:00:00.000Z", randomHex: () => "1".repeat(24),
    async processBoundary(command, args) {
      calls.push([command, args]);
      if (command === "git" && args[0] === "status") return { stdout: "" };
      if (command === "git" && args[0] === "rev-parse") return { stdout: `${revision}\n` };
      if (args.at(-1).includes?.("current_database")) return { stdout: '{"name":"blog_x","systemIdentifier":"system-1"}\n' };
      if (args.at(-1).includes?.("information_schema.columns")) return { stdout: '[["schema-row"]]\n' };
      throw new Error(`unexpected fake argv ${command} ${args.join(" ")}`);
    },
  });
  const sources = runtime.createFactSources();
  assert.equal((await sources.git()).implementationRevision, revision);
  assert.deepEqual(await sources.database(), { name: "blog_x", systemIdentifier: "system-1", schemaRows: 1, schemaSha256: factsSha256([["schema-row"]]) });
  assert.deepEqual(calls.slice(0, 2), [["git", ["status", "--porcelain"]], ["git", ["rev-parse", "HEAD"]]]);
  assert.equal(calls.slice(2).every(([command, args]) => command === "docker-compose" && args.slice(0, 4).join(" ") === "-p blogxlocal -f compose.yaml"), true);
});

test("route collection rejects redirects and final URL drift with redirect:error", async () => {
  const calls = [];
  const sources = testRuntime(memoryArtifactFs(), undefined, async () => ({ stdout: "" }), async (url, options) => { calls.push({ url, options }); return { status: 200, url: url.replace("127.0.0.1", "localhost"), async text() { return "<html></html>"; } }; }).createFactSources();
  await assert.rejects(sources.routes(), /redirect|final URL|origin/i);
  assert.deepEqual(calls[0].options, { redirect: "error" });
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
    const runtime = createRefreshTestRuntime({ fs, randomHex: () => "6".repeat(24), fetch: async () => { throw new Error("unused"); }, clock(value) { if (value === stage) throw new Error(`${stage} fault`); }, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
    await assert.rejects(runtime.runCli(), new RegExp(`${stage} fault`));
    const claim = await runtime.inspectClaim(revision); const report = await runtime.createAttemptStore().assertFailureReportPresent(revision);
    assert.equal(report.report.stage, stage);
    assert.equal(report.report.claimSha256, claim.sha256);
    assert.equal(report.report.preservation, "not_applicable_pre_runtime");
  }

  const fixture = liveFixture({ failPostCutover: true, recollectionFault: true });
  await assert.rejects(fixture.runtime.runCli(), /media|persistence/i);
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
        const fixture = liveFixture({ atomicFault: site }); entries = fixture.evidenceFs.entries; finalPath = "/virtual-workspace/ops/phase6-local-refresh-evidence.json";
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
    const runtime = createRefreshTestRuntime({ fs, randomHex: () => "5".repeat(24), fetch: async () => { throw new Error("unused"); }, clock(value) { if (value === stage) throw new Error(`${stage} fault`); }, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
    await assert.rejects(runtime.runCli(), new RegExp(`${stage} fault`));
    const claim = await runtime.inspectClaim(revision); const report = await runtime.createAttemptStore().assertFailureReportPresent(revision);
    assert.equal(report.report.stage, stage); assert.equal(report.report.claimSha256, claim.sha256); assert.equal(report.report.preservation, "not_applicable_pre_runtime");
  }

  for (const stage of ["local_docker_authority", "preflight_collection", "build-api", "build-web", "migrate", "schema-verify", "cutover-api-web", "routes", "release-blocked", "write-evidence"]) {
    const fixture = liveFixture({ stageFaults: [stage] });
    await assert.rejects(fixture.runtime.runCli(), new RegExp(`${stage} fault`));
    const claim = await fixture.runtime.inspectClaim(fixture.revision); const report = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
    assert.equal(report.report.stage, stage, stage); assert.equal(report.report.claimSha256, claim.sha256, stage);
    assert.doesNotMatch(report.bytes, /postgres:\/\/|Mountpoint|relativePath|migration_fingerprint|environment|command|private\/var/i);
  }

  for (const stage of ["rollback-api-web", "verify-rollback"]) {
    const fixture = liveFixture({ failPostCutover: true, stageFaults: [stage] });
    await assert.rejects(fixture.runtime.runCli(), new RegExp(`${stage} fault`));
    const report = await fixture.runtime.createAttemptStore().assertFailureReportPresent(fixture.revision);
    assert.equal(report.report.stage, stage);
  }

  const recollection = liveFixture({ failPostCutover: true, recollectionFault: true });
  await assert.rejects(recollection.runtime.runCli(), /media|persistence/i);
  assert.equal((await recollection.runtime.createAttemptStore().assertFailureReportPresent(recollection.revision)).report.stage, "failure_recollection");

  const revision = "9".repeat(40); const fs = memoryArtifactFs();
  const reportFault = createRefreshTestRuntime({ fs, randomHex: () => "9".repeat(24), fetch: async () => { throw new Error("unused"); }, clock(stage) { if (["adapter_construction", "failure_report_publication"].includes(stage)) throw Object.assign(new Error(`${stage} fault`), { code: "EIO" }); }, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
  await assert.rejects(reportFault.runCli(), /UNRECOVERABLE_FAILURE_REPORT_INVARIANT:EIO/);
  await assert.doesNotReject(reportFault.inspectClaim(revision));
  await assert.rejects(reportFault.createAttemptStore().assertFailureReportPresent(revision), /failure report|authority|absent/i);

  const claimBase = memoryArtifactFs(); const claimFaultFs = atomicFaultFs(claimBase, "claim", "temp_open");
  const claimFailure = createRefreshTestRuntime({ fs: claimFaultFs, randomHex: () => "8".repeat(24), fetch: async () => { throw new Error("unused"); }, clock: () => undefined, processBoundary: async (command, args) => ({ stdout: command === "git" && args[0] === "rev-parse" ? `${revision}\n` : "" }) });
  await assert.rejects(claimFailure.runCli(), /UNRECOVERABLE_CLAIM_INVARIANT:EIO/);
  assert.equal([...claimBase.entries.keys()].some((path) => path.endsWith(".failure.json")), false);
});
