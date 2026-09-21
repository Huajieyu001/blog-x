import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as filesystem from "node:fs/promises";
import { createManifest, verifyBackupSet } from "./manifest.mjs";
import { collectProductionBackupSet, createProductionInventory } from "./production/collector.mjs";
import { runProductionBackup } from "./production/adapter.mjs";
import { runProductionPipeline } from "./production-pipeline.mjs";
import { createMountedDirectoryTransport } from "./production/mounted-directory.mjs";
import { cleanupDecryptedBackup, decryptBackupPayload, encryptBackupPayload } from "./production/encryption.mjs";
import { applySafeRetention } from "./production/retention.mjs";
import { generatedRecoveryDrillInput, runRecoveryDrill } from "./recovery-drill.mjs";
import { createGeneratedFakeTransport } from "./production/transport.mjs";
import { parseProductionReleaseEvidence, recordProductionFailure } from "./production/results.mjs";
import { loadProductionPipelinePolicy, parseProductionBackupPolicy } from "./production/policy.mjs";
import { validateProductionBackupSource, verifyProductionBackupSource } from "./production/source-authority.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const setId = "20260809T100000Z-a1b2c3d4";

function productionPolicy(sourceBase, suffix = "a1b2c3d4") {
  return {
    format: "blog-x-production-backup-policy",
    version: 1,
    sourceAuthority: { kind: "generated-test", sourceBase },
    collector: {
      project: `blogxprodverify_${suffix}`,
      database: `blog_x_prod_${suffix}`,
      mediaRoot: join(tmpdir(), `blog-x-production-media-${suffix}`),
    },
  };
}

function collectorDependencies(overrides = {}) {
  const id = "11111111-1111-4111-8111-111111111111";
  const source = Buffer.from("collector-source-bytes");
  const derivative = Buffer.from("collector-derivative-bytes");
  return {
    dumpPostgresCustom: async () => Buffer.from("PGDMP-collector-fixture"),
    writePortableExportV1: async () => JSON.stringify({
      format: "blog-x-portable-export", version: 1, exportedAt: "2026-08-09T10:00:00.000Z",
      articles: [], categories: [], tags: [], media: [{ id, width: 1, height: 1, mimeType: "image/webp", createdAt: "2026-08-09T10:00:00.000Z" }], about: null,
    }),
    copyApiMedia: async () => [{ id, sourceKey: `source/${id}.bin`, derivativeKey: `derivative/${id}.webp`, source, derivative }],
    readAllowlistedInventory: async () => ({
      migration: { count: 9, fingerprint: "a".repeat(64) },
      images: { api: `sha256:${"b".repeat(64)}`, web: `sha256:${"c".repeat(64)}`, postgres: `sha256:${"d".repeat(64)}` },
      configChecksums: [{ path: "compose.yaml", sha256: "e".repeat(64) }],
      variableNamesPresent: ["DATABASE_URL", "MEDIA_ROOT", "PUBLIC_ORIGIN"],
      secretAuthorityRef: "external:service-secret-authority",
    }),
    now: () => new Date("2026-08-09T10:00:00.000Z"),
    ...overrides,
  };
}

function failureFilesystem(failAt) {
  return new Proxy(filesystem, {
    get(target, property) {
      if (property === "writeFile") return async (path, ...rest) => {
        if (failAt === "manifest" && String(path).endsWith("/manifest.json")) throw new Error("manifest stage fault");
        if (failAt === "complete" && String(path).endsWith("/COMPLETE")) throw new Error("COMPLETE stage fault");
        return target.writeFile(path, ...rest);
      };
      if (property === "rename" && failAt === "finalization") return async () => { throw new Error("finalization stage fault"); };
      return target[property];
    },
  });
}

async function adapterFixture(context, suffix = "d1b2c3d4") {
  const sourceBase = await mkdtemp(join(tmpdir(), "blog-x-production-source-"));
  const mountRoot = await mkdtemp(join(tmpdir(), "blog-x-production-mount-"));
  const keyRoot = await mkdtemp(join(tmpdir(), "blog-x-production-key-"));
  const resultRoot = await mkdtemp(join(tmpdir(), "blog-x-production-result-"));
  const alertRoot = await mkdtemp(join(tmpdir(), "blog-x-production-alert-"));
  context.after(async () => {
    await Promise.all([sourceBase, mountRoot, keyRoot, resultRoot, alertRoot].map((path) => rm(path, { recursive: true, force: true })));
  });
  await Promise.all([chmod(mountRoot, 0o700), chmod(keyRoot, 0o700), chmod(resultRoot, 0o700), chmod(alertRoot, 0o700)]);
  const profileId = "blog-x-mounted-directory-v1";
  await writeFile(join(mountRoot, "identity.json"), JSON.stringify({ format: "blog-x-mounted-directory", version: 1, profileId }), { mode: 0o600 });
  const keyPath = join(keyRoot, "data.key");
  await writeFile(keyPath, Buffer.alloc(32, 7), { mode: 0o600 });
  const policy = productionPolicy(sourceBase, suffix);
  const collected = await collectProductionBackupSet(policy, collectorDependencies());
  return {
    sourceRoot: collected.finalRoot,
    sourceAuthority: policy.sourceAuthority,
    keyAuthority: { kind: "generated-test", keyPath },
    destination: { kind: "generated-test", mountRoot, profileId, provider: "mounted-directory" },
    retention: { policyId: "daily-v1", minimumKnownGood: 1, maximumSets: 3 },
    resultAuthority: { kind: "generated-test", root: resultRoot },
    alertAuthority: { kind: "generated-test", root: alertRoot },
    createdAt: "2026-08-09T10:00:00.000Z",
  };
}

async function pipelineFixture(context, suffix = "j1b2c3d4") {
  const sourceBase = await mkdtemp(join(tmpdir(), "blog-x-production-source-"));
  const mountRoot = await mkdtemp(join(tmpdir(), "blog-x-production-mount-"));
  const keyRoot = await mkdtemp(join(tmpdir(), "blog-x-production-key-"));
  const resultRoot = await mkdtemp(join(tmpdir(), "blog-x-production-result-"));
  const alertRoot = await mkdtemp(join(tmpdir(), "blog-x-production-alert-"));
  context.after(async () => {
    await Promise.all([sourceBase, mountRoot, keyRoot, resultRoot, alertRoot].map((path) => rm(path, { recursive: true, force: true })));
  });
  await Promise.all([chmod(mountRoot, 0o700), chmod(keyRoot, 0o700), chmod(resultRoot, 0o700), chmod(alertRoot, 0o700)]);
  const profileId = "blog-x-mounted-directory-v1";
  await writeFile(join(mountRoot, "identity.json"), JSON.stringify({ format: "blog-x-mounted-directory", version: 1, profileId }), { mode: 0o600 });
  const keyPath = join(keyRoot, "data.key");
  await writeFile(keyPath, Buffer.alloc(32, 9), { mode: 0o600 });
  const collector = productionPolicy(sourceBase, suffix);
  return {
    format: "blog-x-production-pipeline-policy", version: 1,
    sourceAuthority: collector.sourceAuthority, collector: collector.collector,
    destination: { kind: "generated-test", mountRoot, profileId, provider: "mounted-directory" }, keyAuthority: { kind: "generated-test", keyPath },
    retention: { policyId: "daily-v1", minimumKnownGood: 1, maximumSets: 3 },
    resultAuthority: { kind: "generated-test", root: resultRoot }, alertAuthority: { kind: "generated-test", root: alertRoot },
  };
}

async function writeCompleteSet(root, migrationCount = 9) {
  const id = "11111111-1111-4111-8111-111111111111";
  const source = Buffer.from("production-source-bytes");
  const derivative = Buffer.from("production-derivative-bytes");
  await mkdir(join(root, "media/source"), { recursive: true, mode: 0o700 });
  await mkdir(join(root, "media/derivative"), { recursive: true, mode: 0o700 });
  await mkdir(join(root, "config"), { recursive: true, mode: 0o700 });
  await writeFile(join(root, "database.dump"), "PGDMP-production-fixture", { mode: 0o600 });
  await writeFile(join(root, "portable-export-v1.json"), JSON.stringify({
    format: "blog-x-portable-export", version: 1, exportedAt: "2026-08-09T10:00:00.000Z",
    articles: [], categories: [], tags: [], media: [], about: null,
  }), { mode: 0o600 });
  const sourcePath = `media/source/${id}.bin`;
  const derivativePath = `media/derivative/${id}.webp`;
  await writeFile(join(root, sourcePath), source, { mode: 0o600 });
  await writeFile(join(root, derivativePath), derivative, { mode: 0o600 });
  await writeFile(join(root, "config/inventory.json"), JSON.stringify({
    format: "blog-x-backup-config-inventory", version: 1,
    migration: { count: migrationCount, fingerprint: "a".repeat(64) },
    images: { api: `sha256:${"b".repeat(64)}`, web: `sha256:${"c".repeat(64)}`, postgres: `sha256:${"d".repeat(64)}` },
    configChecksums: [{ path: "ops/topology-policy.json", sha256: "e".repeat(64) }],
    variableNamesPresent: ["DATABASE_URL", "MEDIA_ROOT", "PUBLIC_ORIGIN"],
    mediaRootRole: "api-owned-source-and-derivative", secretAuthorityRef: "external:service-secret-authority",
    media: [{ id, sourcePath, derivativePath, sourceSha256: sha(source), derivativeSha256: sha(derivative) }],
  }), { mode: 0o600 });
  const manifest = await createManifest(root, setId, "2026-08-09T10:00:00.000Z");
  const manifestText = JSON.stringify(manifest);
  await writeFile(join(root, "manifest.json"), manifestText, { mode: 0o600 });
  await writeFile(join(root, "COMPLETE"), JSON.stringify({
    format: "blog-x-backup-complete", version: 1, manifestSha256: sha(manifestText),
  }), { mode: 0o600 });
}

test("production source authority accepts only an exact generated root and shares complete-set checks", async (context) => {
  const sourceBase = await mkdtemp(join(tmpdir(), "blog-x-production-source-"));
  context.after(async () => { await rm(sourceBase, { recursive: true, force: true }); });
  const root = join(sourceBase, setId);
  await mkdir(root, { mode: 0o700 });
  await writeCompleteSet(root);
  const authority = { kind: "generated-test", sourceBase };

  assert.equal(validateProductionBackupSource(root, authority), root);
  const result = await verifyProductionBackupSource(root, authority);
  assert.equal(result.inventory.migration.count, 9);
  await assert.rejects(verifyBackupSet(root), /backup root|staging/i);

  for (const unsafe of ["/", tmpdir(), process.cwd(), join(sourceBase, "..", "escape"), join(sourceBase, "blogxverify_a1b2c3d4")]) {
    assert.throws(() => validateProductionBackupSource(unsafe, authority), /production backup source/i);
  }
});

test("production authorities bind a positive migration ledger fingerprint without pinning a historical count", async (context) => {
  const sourceBase = await mkdtemp(join(tmpdir(), "blog-x-production-source-"));
  context.after(async () => { await rm(sourceBase, { recursive: true, force: true }); });
  const currentInventory = await collectorDependencies().readAllowlistedInventory();
  assert.doesNotThrow(() => createProductionInventory(currentInventory), "collector inventory accepts a positive migration count");
  assert.doesNotThrow(() => createProductionInventory({ ...currentInventory, migration: { ...currentInventory.migration, count: 12 } }), "collector inventory accepts later append-only migrations");
  assert.throws(() => createProductionInventory({
    ...currentInventory,
    migration: { ...currentInventory.migration, count: 0 },
  }), /migration/i, "collector inventory rejects a missing migration ledger");

  const currentRoot = join(sourceBase, setId);
  await mkdir(currentRoot, { mode: 0o700 });
  await writeCompleteSet(currentRoot);
  const authority = { kind: "generated-test", sourceBase };
  assert.equal((await verifyProductionBackupSource(currentRoot, authority)).inventory.migration.count, 9);

  const laterRoot = join(sourceBase, "20260809T100001Z-b1c2d3e4");
  await mkdir(laterRoot, { mode: 0o700 });
  await writeCompleteSet(laterRoot, 12);
  assert.equal((await verifyProductionBackupSource(laterRoot, authority)).inventory.migration.count, 12);
  const invalidRoot = join(sourceBase, "20260809T100002Z-c1c2d3e4");
  await mkdir(invalidRoot, { mode: 0o700 });
  await writeCompleteSet(invalidRoot, 0);
  await assert.rejects(verifyProductionBackupSource(invalidRoot, authority), /config inventory/i, "source authority rejects a missing migration ledger");
});

test("production source authority rejects rehearsal roots, links, and content mutations before success", async (context) => {
  const sourceBase = await mkdtemp(join(tmpdir(), "blog-x-production-source-"));
  const rehearsalBase = await mkdtemp(join(tmpdir(), "blog-x-backup-verify-"));
  context.after(async () => { await rm(sourceBase, { recursive: true, force: true }); await rm(rehearsalBase, { recursive: true, force: true }); });
  const root = join(sourceBase, setId);
  await mkdir(root, { mode: 0o700 });
  await writeCompleteSet(root);
  const authority = { kind: "generated-test", sourceBase };
  const rehearsalRoot = join(rehearsalBase, setId);
  await mkdir(rehearsalRoot, { mode: 0o700 });

  await assert.rejects(verifyProductionBackupSource(rehearsalRoot, authority), /production backup source/i);
  await writeFile(join(root, "database.dump"), "tampered", { mode: 0o600 });
  await assert.rejects(verifyProductionBackupSource(root, authority), /database\.dump.*(?:size|checksum)|(?:size|checksum).*database\.dump/i);
  await rm(join(root, "database.dump"));
  await symlink(join(sourceBase, "outside"), join(root, "linked-member"));
  await assert.rejects(verifyProductionBackupSource(root, authority), /link|extra|missing/i);
  await chmod(root, 0o755);
  assert.throws(() => validateProductionBackupSource(root, authority), /permissions/i);
  assert.equal((await readFile(join(root, "manifest.json"), "utf8")).includes("blog-x-backup-set"), true);
});

test("collector atomically creates a fresh all-authority production set through fixed named operations", async (context) => {
  const sourceBase = await mkdtemp(join(tmpdir(), "blog-x-production-source-"));
  context.after(async () => { await rm(sourceBase, { recursive: true, force: true }); });
  const policy = productionPolicy(sourceBase);
  assert.equal(parseProductionBackupPolicy(policy).collector.project, "blogxprodverify_a1b2c3d4");
  const result = await collectProductionBackupSet(policy, collectorDependencies());
  const verified = await verifyProductionBackupSource(result.finalRoot, policy.sourceAuthority);
  assert.equal(verified.inventory.migration.count, 9);
  assert.equal(await readFile(join(result.finalRoot, "database.dump"), "utf8"), "PGDMP-collector-fixture");
  assert.equal(JSON.parse(await readFile(join(result.finalRoot, "portable-export-v1.json"), "utf8")).media.length, 1);
  assert.equal((await readFile(join(result.finalRoot, "media/source/11111111-1111-4111-8111-111111111111.bin"), "utf8")), "collector-source-bytes");
  assert.equal(createProductionInventory(verified.inventory).migration.count, 9);
  assert.deepEqual((await readdir(sourceBase)).filter((name) => name.startsWith(".")).length, 0);
});

test("collector rejects policy injection and preserves known-good finals through failure and parallel collection", async (context) => {
  const sourceBase = await mkdtemp(join(tmpdir(), "blog-x-production-source-"));
  context.after(async () => { await rm(sourceBase, { recursive: true, force: true }); });
  const policy = productionPolicy(sourceBase, "b1b2c3d4");
  for (const unsafe of [
    { ...policy, command: "not-allowed" },
    { ...policy, url: "not-allowed" },
    { ...policy, collector: { ...policy.collector, project: "blogxverify_b1b2c3d4" } },
    { ...policy, collector: { ...policy.collector, database: "blog_x" } },
    { ...policy, sourceAuthority: { kind: "service", sourceBase: process.cwd() }, collector: { project: "blog-x", database: "blog_x", mediaRoot: "/var/lib/blog-x/media" } },
  ]) assert.throws(() => parseProductionBackupPolicy(unsafe), /production backup policy/i);

  const good = await collectProductionBackupSet(policy, collectorDependencies());
  await assert.rejects(collectProductionBackupSet(policy, collectorDependencies({ copyApiMedia: async () => [] })), /media|portable/i);
  await verifyProductionBackupSource(good.finalRoot, policy.sourceAuthority);
  const afterFailure = await readdir(sourceBase);
  assert.equal(afterFailure.includes(good.setId), true);
  assert.equal(afterFailure.some((name) => name.startsWith(".") && name.includes("incomplete")), true);

  const [left, right] = await Promise.all([
    collectProductionBackupSet(policy, collectorDependencies()),
    collectProductionBackupSet(policy, collectorDependencies()),
  ]);
  assert.notEqual(left.finalRoot, right.finalRoot);
  await Promise.all([verifyProductionBackupSource(left.finalRoot, policy.sourceAuthority), verifyProductionBackupSource(right.finalRoot, policy.sourceAuthority)]);
});

test("collector fails closed at every collection and finalization stage without replacing a known-good set", async (context) => {
  const sourceBase = await mkdtemp(join(tmpdir(), "blog-x-production-source-"));
  context.after(async () => { await rm(sourceBase, { recursive: true, force: true }); });
  const policy = productionPolicy(sourceBase, "c1b2c3d4");
  const good = await collectProductionBackupSet(policy, collectorDependencies());
  const goodManifest = await readFile(join(good.finalRoot, "manifest.json"), "utf8");
  const failures = [
    ["database", collectorDependencies({ dumpPostgresCustom: async () => { throw new Error("database stage fault"); } })],
    ["portable", collectorDependencies({ writePortableExportV1: async () => { throw new Error("portable stage fault"); } })],
    ["media", collectorDependencies({ copyApiMedia: async () => { throw new Error("media stage fault"); } })],
    ["config", collectorDependencies({ readAllowlistedInventory: async () => { throw new Error("config stage fault"); } })],
    ["migration", collectorDependencies({ readAllowlistedInventory: async () => ({ ...await collectorDependencies().readAllowlistedInventory(), migration: { count: 0, fingerprint: "a".repeat(64) } }) })],
    ["image", collectorDependencies({ readAllowlistedInventory: async () => ({ ...await collectorDependencies().readAllowlistedInventory(), images: { api: "sha256:bad" } }) })],
    ["manifest", { ...collectorDependencies(), filesystem: failureFilesystem("manifest") }],
    ["COMPLETE", { ...collectorDependencies(), filesystem: failureFilesystem("complete") }],
    ["finalization", { ...collectorDependencies(), filesystem: failureFilesystem("finalization") }],
  ];
  for (const [stage, dependencies] of failures) {
    await assert.rejects(collectProductionBackupSet(policy, dependencies), new RegExp(String(stage), "i"));
    assert.equal(await readFile(join(good.finalRoot, "manifest.json"), "utf8"), goodManifest, `${stage} must preserve the known-good final`);
  }
  const entries = await readdir(sourceBase);
  assert.equal(entries.filter((name) => /^\d{8}T\d{6}Z-/.test(name)).length, 1);
  assert.equal(entries.filter((name) => name.startsWith(".") && name.includes(".incomplete-")).length, failures.length);
});

test("concrete generated mount receives only authenticated ciphertext, receipt, result, and alert outcome", async (context) => {
  const input = await adapterFixture(context);
  const result = await runProductionBackup(input, { inspectMount: async (root) => ({ isMountPoint: true, root }) });
  assert.equal(result.scope, "generated-mounted-fixture");
  assert.match(result.ciphertextSha256, /^[a-f0-9]{64}$/);
  const mountEntries = await readdir(input.destination.mountRoot, { recursive: true });
  assert.equal(mountEntries.some((name) => /database\.dump|portable-export|media\/source|media\/derivative/.test(name)), false);
  assert.equal(mountEntries.some((name) => name.endsWith(".aesgcm")), true);
  assert.equal(mountEntries.some((name) => name.endsWith(".receipt.json")), true);
  assert.throws(() => parseProductionReleaseEvidence(result), /generated|live/i);
});

test("adapter fails closed for mount, receipt, catalog, retention, result, alert, and fake transport faults", async (context) => {
  const mountFault = await adapterFixture(context, "e1b2c3d4");
  await assert.rejects(runProductionBackup(mountFault, { inspectMount: async () => ({ isMountPoint: false }) }), /transfer/i);
  const receiptFault = await adapterFixture(context, "f1b2c3d4");
  const fake = createGeneratedFakeTransport({ failAt: "receipt" });
  await assert.rejects(runProductionBackup(receiptFault, { inspectMount: async (root) => ({ isMountPoint: true, root }), transport: fake }), /transfer|receipt/i);
  const resultFault = await adapterFixture(context, "g1b2c3d4");
  await assert.rejects(runProductionBackup(resultFault, { inspectMount: async (root) => ({ isMountPoint: true, root }), recordResult: async () => { throw new Error("result stage fault"); } }), /result/i);
  const alertFault = await adapterFixture(context, "h1b2c3d4");
  await assert.rejects(runProductionBackup(alertFault, { inspectMount: async (root) => ({ isMountPoint: true, root }), recordAlert: async () => ({ status: "unconfirmed" }) }), /result/i);
});

test("a successful generated fake remains fault-only and cannot parse as production release evidence", async (context) => {
  const input = await adapterFixture(context, "z1b2c3d4");
  const result = await runProductionBackup(input, {
    inspectMount: async (root) => ({ isMountPoint: true, root }),
    transport: createGeneratedFakeTransport(),
  });
  assert.equal(result.scope, "generated-fake");
  assert.throws(() => parseProductionReleaseEvidence(result), /generated|live/i);
});

test("mounted transport retries only an exact complete ciphertext receipt pair and provides sealed read-back", async (context) => {
  const input = await adapterFixture(context, "r1b2c3d4");
  const transport = await createMountedDirectoryTransport(input.destination, { inspectMount: async (root) => ({ isMountPoint: true, root }) });
  const payload = {
    setId: "20260809T100000Z-a1b2c3d4", ciphertext: Buffer.from("exact-ciphertext"), manifestSha256: "a".repeat(64),
    aadSha256: "b".repeat(64), createdAt: "2026-08-09T10:00:00.000Z",
  };
  payload.ciphertextSha256 = sha(payload.ciphertext);
  const first = await transport.transfer(payload);
  const retry = await transport.transfer({ ...payload, ciphertext: Buffer.from(payload.ciphertext) });
  assert.equal(retry.receiptSha256, first.receiptSha256);
  assert.equal((await transport.catalog()).length, 1);
  const readBack = await transport.readSet(payload.setId);
  assert.deepEqual(readBack.ciphertext, payload.ciphertext);
  assert.equal(readBack.receiptSha256, first.receiptSha256);
  assert.equal(Object.hasOwn(readBack, "cipherPath"), false);
  await assert.rejects(transport.transfer({ ...payload, ciphertext: Buffer.from("conflicting-ciphertext"), ciphertextSha256: sha("conflicting-ciphertext") }), /collision.*match/i);
  await assert.rejects(transport.transfer({ ...payload, manifestSha256: "c".repeat(64) }), /collision.*match/i);
  await rm(join(input.destination.mountRoot, "objects", `${payload.setId}.receipt.json`));
  await assert.rejects(transport.transfer(payload), /incomplete/i);
});

test("failure attempt evidence is append-only, fixed-schema, and redacted", async (context) => {
  const input = await adapterFixture(context, "s1b2c3d4");
  const result = await recordProductionFailure(input.resultAuthority, {
    format: "blog-x-production-backup-attempt", version: 1, status: "failed", runId: "attempt-a1b2c3d4",
    observedAt: "2026-08-09T10:00:00.000Z", scope: "generated-production-pipeline", stage: "transfer", code: "TRANSFER_FAILED",
  });
  assert.equal(result.code, "TRANSFER_FAILED");
  const entries = await readdir(input.resultAuthority.root);
  assert.equal(entries.filter((entry) => entry.startsWith("attempt-")).length, 1);
  await assert.rejects(recordProductionFailure(input.resultAuthority, { ...result, runId: "attempt-a1b2c3d5", code: "postgres://secret" }), /schema|sensitive/i);
});

test("encrypted mounted read-back authenticates before staging and restores only an isolated generated target", async (context) => {
  const input = await adapterFixture(context, "u1b2c3d4");
  const source = await verifyProductionBackupSource(input.sourceRoot, input.sourceAuthority);
  const transport = await createMountedDirectoryTransport(input.destination, { inspectMount: async (root) => ({ isMountPoint: true, root }) });
  const encrypted = await encryptBackupPayload({
    sourceRoot: input.sourceRoot, manifest: source.manifest, marker: source.marker, createdAt: source.manifest.createdAt,
    retentionPolicyId: input.retention.policyId, destinationProfileId: transport.destinationProfileId, keyAuthority: input.keyAuthority,
  });
  await transport.transfer({ setId: source.manifest.setId, ...encrypted, createdAt: source.manifest.createdAt });
  const token = source.manifest.setId.split("-")[1];
  const stagingRoot = join(tmpdir(), `blog-x-backup-verify-recovery-${token}`);
  const remote = await transport.readSet(source.manifest.setId);
  const decrypted = await decryptBackupPayload({ ciphertext: remote.ciphertext, receipt: remote.receipt, retentionPolicyId: input.retention.policyId, keyAuthority: input.keyAuthority, stagingRoot });
  assert.equal(JSON.parse(await readFile(join(decrypted.backupRoot, "portable-export-v1.json"), "utf8")).media.length, 1);
  await cleanupDecryptedBackup(stagingRoot);
  await assert.rejects(readFile(stagingRoot), /ENOENT/);
  const tampered = Buffer.from(remote.ciphertext);
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(decryptBackupPayload({ ciphertext: tampered, receipt: remote.receipt, retentionPolicyId: input.retention.policyId, keyAuthority: input.keyAuthority, stagingRoot }), /digest|authentication/i);
  const restoreRoot = join(tmpdir(), `blog-x-restore-verify-${token}`);
  let restorePlan;
  const drill = await runRecoveryDrill(generatedRecoveryDrillInput({
    setId: source.manifest.setId, transport, keyAuthority: input.keyAuthority, retentionPolicyId: input.retention.policyId,
    restoreRoot, webOrigin: "http://127.0.0.1:19080",
  }), {
    inspectTarget: async () => ({ namespaceExists: false, databaseExists: false, mediaVolumeExists: false, rootExists: false, rootIsLink: false, rootEntries: [] }),
    mutate: async (plan) => { restorePlan = plan; return { restored: true }; },
  });
  assert.equal(drill.setId, source.manifest.setId);
  assert.equal(restorePlan.backupRoot, join(stagingRoot, source.manifest.setId));
  await assert.rejects(readFile(stagingRoot), /ENOENT/);
  await assert.rejects(runRecoveryDrill({ ...generatedRecoveryDrillInput({ setId: source.manifest.setId, transport, keyAuthority: input.keyAuthority, retentionPolicyId: input.retention.policyId, restoreRoot, webOrigin: "http://127.0.0.1:19080" }), namespace: "blogxrestore_bad" }), /authority/i);
});

test("receipt-gated retention preserves the minimum known-good ciphertext and deletes nothing on catalog ambiguity", async (context) => {
  const input = await adapterFixture(context, "i1b2c3d4");
  const transport = await createMountedDirectoryTransport(input.destination, { inspectMount: async (root) => ({ isMountPoint: true, root }) });
  const transfer = async (setId) => {
    const ciphertext = Buffer.from(`ciphertext-${setId}`);
    const digest = sha(ciphertext);
    await transport.transfer({ setId, ciphertext, ciphertextSha256: digest, manifestSha256: "a".repeat(64), aadSha256: "b".repeat(64), createdAt: "2026-08-09T10:00:00.000Z" });
  };
  await transfer("20260809T100000Z-a1b2c3d4");
  await transfer("20260809T100001Z-b1b2c3d4");
  await transfer("20260809T100002Z-c1b2c3d4");
  const retained = await applySafeRetention({ transport, retentionPolicyId: "daily-v1", minimumKnownGood: 2, maximumSets: 2 });
  assert.deepEqual(retained.deletedSetIds, ["20260809T100000Z-a1b2c3d4"]);
  assert.equal((await transport.catalog()).length, 2);
  await writeFile(join(input.destination.mountRoot, "objects", "unexpected.txt"), "ambiguous", { mode: 0o600 });
  await assert.rejects(applySafeRetention({ transport, retentionPolicyId: "daily-v1", minimumKnownGood: 1, maximumSets: 1 }), /catalog|unexpected/i);
  assert.equal((await readdir(join(input.destination.mountRoot, "objects"))).filter((name) => name.endsWith(".aesgcm")).length, 2);
});

test("pipeline creates and verifies a fresh set before the concrete mounted adapter", async (context) => {
  const policy = await pipelineFixture(context);
  const result = await runProductionPipeline(policy, { ...collectorDependencies(), inspectMount: async (root) => ({ isMountPoint: true, root }) });
  assert.equal(result.scope, "generated-production-pipeline");
  const sourceEntries = await readdir(policy.sourceAuthority.sourceBase);
  assert.equal(sourceEntries.filter((name) => /^\d{8}T\d{6}Z-/.test(name)).length, 1);
  await assert.rejects(runProductionPipeline({ ...policy, sourceRoot: "/manual-set" }, { ...collectorDependencies(), inspectMount: async (root) => ({ isMountPoint: true, root }) }), /production backup policy/i);
});

test("pipeline loads only a protected external profile and rejects unsafe profile paths before collection", async (context) => {
  const policy = await pipelineFixture(context, "k1b2c3d4");
  const profileRoot = await mkdtemp(join(tmpdir(), "blog-x-production-profile-"));
  context.after(async () => { await rm(profileRoot, { recursive: true, force: true }); });
  await chmod(profileRoot, 0o700);
  const profilePath = join(profileRoot, "policy.json");
  await writeFile(profilePath, JSON.stringify(policy), { mode: 0o600 });
  assert.deepEqual(await loadProductionPipelinePolicy(profilePath), policy);
  await chmod(profilePath, 0o644);
  await assert.rejects(loadProductionPipelinePolicy(profilePath), /production backup policy/i);
  await chmod(profilePath, 0o600);
  await assert.rejects(loadProductionPipelinePolicy(join(profileRoot, "..", "policy.json")), /production backup policy/i);
});

test("pipeline unit contract remains dormant, strict, collect-then-adapt, and prohibition-fixture controlled", async () => {
  const service = await readFile(new URL("../../ops/systemd/blog-x-backup.service", import.meta.url), "utf8");
  const timer = await readFile(new URL("../../ops/systemd/blog-x-backup.timer", import.meta.url), "utf8");
  const names = JSON.parse(await readFile(new URL("../../ops/backup-policy.names.json", import.meta.url), "utf8"));
  assert.match(service, /production-pipeline\.mjs/);
  assert.match(service, /ConditionPathIsMountPoint=/);
  assert.match(service, /UMask=0077/);
  assert.doesNotMatch(service, /backup\/create\.mjs|systemctl|enable/i);
  assert.match(timer, /OnCalendar=daily/);
  assert.match(timer, /Persistent=true/);
  assert.equal(names.fields.some((field) => Object.hasOwn(field, "value")), false);
  const subjectPath = process.env.GSD_PROHIB_SUBJECT ?? new URL("../fixtures/prohibitions/production-backup-safe.json", import.meta.url);
  const subject = JSON.parse(await readFile(subjectPath, "utf8"));
  assert.equal(subject.format, "blog-x-production-backup-prohibition");
  assert.equal(subject.collectThenMounted, true);
  for (const key of ["allowsFake", "allowsManualSet", "allowsPlaintext", "allowsRehearsalAuthority", "allowsRemoteCommand", "hasReceipt", "hasAlertOutcome"]) assert.equal(subject[key], key.startsWith("has") ? true : false);
});
