import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createManifest, verifyBackupSet } from "./manifest.mjs";
import { collectProductionBackupSet, createProductionInventory } from "./production/collector.mjs";
import { parseProductionBackupPolicy } from "./production/policy.mjs";
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
      migration: { count: 7, fingerprint: "a".repeat(64) },
      images: { api: `sha256:${"b".repeat(64)}`, web: `sha256:${"c".repeat(64)}`, postgres: `sha256:${"d".repeat(64)}` },
      configChecksums: [{ path: "compose.yaml", sha256: "e".repeat(64) }],
      variableNamesPresent: ["DATABASE_URL", "MEDIA_ROOT", "PUBLIC_ORIGIN"],
      secretAuthorityRef: "external:service-secret-authority",
    }),
    now: () => new Date("2026-08-09T10:00:00.000Z"),
    ...overrides,
  };
}

async function writeCompleteSet(root) {
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
    migration: { count: 7, fingerprint: "a".repeat(64) },
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
  assert.equal(result.inventory.migration.count, 7);
  await assert.rejects(verifyBackupSet(root), /backup root|staging/i);

  for (const unsafe of ["/", tmpdir(), process.cwd(), join(sourceBase, "..", "escape"), join(sourceBase, "blogxverify_a1b2c3d4")]) {
    assert.throws(() => validateProductionBackupSource(unsafe, authority), /production backup source/i);
  }
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
  assert.equal(verified.inventory.migration.count, 7);
  assert.equal(await readFile(join(result.finalRoot, "database.dump"), "utf8"), "PGDMP-collector-fixture");
  assert.equal(JSON.parse(await readFile(join(result.finalRoot, "portable-export-v1.json"), "utf8")).media.length, 1);
  assert.equal((await readFile(join(result.finalRoot, "media/source/11111111-1111-4111-8111-111111111111.bin"), "utf8")), "collector-source-bytes");
  assert.equal(createProductionInventory(verified.inventory).migration.count, 7);
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
