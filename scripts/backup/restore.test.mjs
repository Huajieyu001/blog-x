import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createBackupSet } from "./create.mjs";
import {
  cleanupGeneratedRestoreRoot,
  preflightRestore,
  restoreBackupSet,
  validateRestoreDatabase,
  validateRestoreMediaVolume,
  validateRestoreNamespace,
  validateRestoreRoot,
  validateRestoreWebOrigin,
} from "./restore.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");

function policy(destinationRoot) {
  return {
    format: "blog-x-backup-policy", version: 1, destination_root: destinationRoot,
    off_host_destination_ref: "external:off-host-destination", retention_decision_ref: "external:retention-decision",
    encryption_key_ref: "external:encryption-authority", alert_recipient_ref: "external:alert-recipient",
    secret_authority_ref: "external:service-secret-authority", schedule: "daily",
    compose_project: "blogxverify_a1b2c3d4", database_name: "blog_x_a1b2c3d4", media_root: "/var/lib/blog-x/media",
    config_inventory_sources: ["ops/production-config.names.json", "ops/topology-policy.json"],
  };
}

async function collectComplete(stage) {
  const id = "11111111-1111-4111-8111-111111111111";
  const source = Buffer.from("source-restore-bytes");
  const derivative = Buffer.from("derivative-restore-bytes");
  await mkdir(join(stage, "media/source"), { recursive: true });
  await mkdir(join(stage, "media/derivative"), { recursive: true });
  await mkdir(join(stage, "config"), { recursive: true });
  await writeFile(join(stage, "database.dump"), "PGDMP-restore-fixture");
  await writeFile(join(stage, "portable-export-v1.json"), JSON.stringify({
    format: "blog-x-portable-export", version: 1, exportedAt: "2026-08-09T10:00:00.000Z",
    articles: [], categories: [], tags: [], media: [], about: null,
  }));
  const sourcePath = `media/source/${id}.bin`;
  const derivativePath = `media/derivative/${id}.webp`;
  await writeFile(join(stage, sourcePath), source);
  await writeFile(join(stage, derivativePath), derivative);
  await writeFile(join(stage, "config/inventory.json"), JSON.stringify({
    format: "blog-x-backup-config-inventory", version: 1,
    migration: { count: 6, fingerprint: "a".repeat(64) },
    images: { api: `sha256:${"b".repeat(64)}`, web: `sha256:${"c".repeat(64)}`, postgres: `sha256:${"d".repeat(64)}` },
    configChecksums: [{ path: "ops/topology-policy.json", sha256: "e".repeat(64) }],
    variableNamesPresent: ["DATABASE_URL", "MEDIA_ROOT", "PUBLIC_ORIGIN"],
    mediaRootRole: "api-owned-source-and-derivative", secretAuthorityRef: "external:service-secret-authority",
    media: [{ id, sourcePath, derivativePath, sourceSha256: sha(source), derivativeSha256: sha(derivative) }],
  }));
}

async function fixture(context) {
  const backupRoot = await mkdtemp(join(tmpdir(), "blog-x-backup-verify-"));
  const restoreRoot = join(tmpdir(), `blog-x-restore-verify-${Date.now()}-a1b2c3`);
  context.after(async () => { await rm(backupRoot, { recursive: true, force: true }); await rm(restoreRoot, { recursive: true, force: true }); });
  const backup = await createBackupSet(policy(backupRoot), { setId: "20260809T100000Z-a1b2c3d4", collect: collectComplete });
  return { backupRoot: backup.finalRoot, restoreRoot };
}

function target(values = {}) {
  return {
    namespace: "blogxrestore_a1b2c3d4", database: "blog_x_restore_a1b2c3d4",
    mediaVolume: "blogxrestore_a1b2c3d4_media-data", webOrigin: "http://127.0.0.1:43100",
    ...values,
  };
}

test("restore target validators accept only one exact generated authority", () => {
  assert.equal(validateRestoreNamespace("blogxrestore_a1b2c3d4"), "blogxrestore_a1b2c3d4");
  assert.equal(validateRestoreDatabase("blog_x_restore_a1b2c3d4", "blogxrestore_a1b2c3d4"), "blog_x_restore_a1b2c3d4");
  assert.equal(validateRestoreMediaVolume("blogxrestore_a1b2c3d4_media-data", "blogxrestore_a1b2c3d4"), "blogxrestore_a1b2c3d4_media-data");
  assert.equal(validateRestoreWebOrigin("http://127.0.0.1:43100"), "http://127.0.0.1:43100");
  for (const value of ["", "blogxlocal", "blogxverify_a1b2c3d4", "blogxrestore_A1B2C3D4", "blogxrestore_a;rm"]) assert.throws(() => validateRestoreNamespace(value), /namespace/i);
  for (const value of ["blog_x", "blog_x_restore_wrong", "postgres", "blog_x_restore_a1b2c3d4_extra"]) assert.throws(() => validateRestoreDatabase(value, "blogxrestore_a1b2c3d4"), /database/i);
  for (const value of ["media-data", "blogxlocal_media-data", "blogxrestore_a1b2c3d4_postgres-data"]) assert.throws(() => validateRestoreMediaVolume(value, "blogxrestore_a1b2c3d4"), /media volume/i);
  for (const value of ["https://example.com", "http://localhost:43100", "http://127.0.0.1:43100/path"]) assert.throws(() => validateRestoreWebOrigin(value), /loopback/i);
});

test("preflight is fully read-only and rejects broad, active, nonempty, linked, or tampered input before mutation", async (context) => {
  const generated = await fixture(context);
  let mutations = 0;
  const cleanInspect = async () => ({ namespaceExists: false, databaseExists: false, mediaVolumeExists: false, rootExists: false, rootEntries: [], rootIsLink: false });
  const good = await preflightRestore({ backupRoot: generated.backupRoot, restoreRoot: generated.restoreRoot, ...target() }, { inspectTarget: cleanInspect });
  assert.equal(good.namespace, target().namespace);
  assert.equal(mutations, 0);
  for (const values of [
    { namespace: "blogxlocal" }, { database: "blog_x" }, { mediaVolume: "blogxlocal_media-data" },
    { webOrigin: "https://example.com" }, { restoreRoot: tmpdir() },
  ]) await assert.rejects(preflightRestore({ backupRoot: generated.backupRoot, restoreRoot: generated.restoreRoot, ...target(), ...values }, { inspectTarget: cleanInspect }), /restore|namespace|database|volume|loopback/i);
  for (const state of [
    { namespaceExists: true }, { databaseExists: true }, { mediaVolumeExists: true }, { rootExists: true, rootEntries: ["sentinel"] }, { rootExists: true, rootIsLink: true, rootEntries: [] },
  ]) await assert.rejects(preflightRestore({ backupRoot: generated.backupRoot, restoreRoot: generated.restoreRoot, ...target() }, { inspectTarget: async () => ({ namespaceExists: false, databaseExists: false, mediaVolumeExists: false, rootExists: false, rootEntries: [], rootIsLink: false, ...state }) }), /empty|active|exists|link/i);
  await writeFile(join(generated.backupRoot, "database.dump"), "tampered");
  await assert.rejects(restoreBackupSet({ backupRoot: generated.backupRoot, restoreRoot: generated.restoreRoot, ...target() }, {
    inspectTarget: cleanInspect, mutate: async () => { mutations += 1; },
  }), /checksum|size/i);
  assert.equal(mutations, 0);
});

test("restore mutates exactly once only after a complete preflight and cleanup is bounded", async (context) => {
  const generated = await fixture(context);
  let calls = 0;
  const result = await restoreBackupSet({ backupRoot: generated.backupRoot, restoreRoot: generated.restoreRoot, ...target() }, {
    inspectTarget: async () => ({ namespaceExists: false, databaseExists: false, mediaVolumeExists: false, rootExists: false, rootEntries: [], rootIsLink: false }),
    mutate: async (plan) => { calls += 1; await mkdir(plan.restoreRoot); return { restored: true }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.message, "RESTORE READY blogxrestore_a1b2c3d4");
  assert.equal((await stat(generated.restoreRoot)).isDirectory(), true);
  await cleanupGeneratedRestoreRoot(generated.restoreRoot);
  await assert.rejects(stat(generated.restoreRoot), /ENOENT/);
  for (const value of ["/", tmpdir(), process.cwd()]) await assert.rejects(cleanupGeneratedRestoreRoot(value), /restore root/i);
});

test("restore root symlink is rejected without following it", async (context) => {
  const generated = await fixture(context);
  const outside = await mkdtemp(join(tmpdir(), "blog-x-restore-sentinel-"));
  context.after(async () => { await rm(outside, { recursive: true, force: true }); });
  await symlink(outside, generated.restoreRoot);
  await assert.rejects(preflightRestore({ backupRoot: generated.backupRoot, restoreRoot: generated.restoreRoot, ...target() }), /link/i);
  await writeFile(join(outside, "sentinel"), "preserved");
  assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "preserved");
});

test("restore prohibition descriptor rejects broad targets and accepts generated empty targets", async () => {
  const subjectPath = process.env.GSD_PROHIB_SUBJECT ?? new URL("../fixtures/prohibitions/restore-generated-target.json", import.meta.url);
  const subject = JSON.parse(await readFile(subjectPath, "utf8"));
  assert.deepEqual(Object.keys(subject).sort(), ["database", "empty", "format", "generated", "mediaVolume", "namespace", "version", "webOrigin"]);
  assert.equal(subject.format, "blog-x-restore-target");
  assert.equal(subject.version, 1);
  assert.equal(subject.generated, true);
  assert.equal(subject.empty, true);
  validateRestoreNamespace(subject.namespace);
  validateRestoreDatabase(subject.database, subject.namespace);
  validateRestoreMediaVolume(subject.mediaVolume, subject.namespace);
  validateRestoreWebOrigin(subject.webOrigin);
});
