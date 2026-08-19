import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { parseBackupPolicy } from "./policy.mjs";
import { cleanupBackupStaging, validateBackupRoot, validateBackupSetId } from "./paths.mjs";
import { hashFile, verifyBackupSet } from "./manifest.mjs";
import { verifyCompleteBackupSetContents } from "./content-verifier.mjs";
import { createBackupSet } from "./create.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");

function policy(destinationRoot, suffix = "a1b2c3d4") {
  return {
    format: "blog-x-backup-policy",
    version: 1,
    destination_root: destinationRoot,
    off_host_destination_ref: "external:off-host-destination",
    retention_decision_ref: "external:retention-decision",
    encryption_key_ref: "external:encryption-authority",
    alert_recipient_ref: "external:alert-recipient",
    secret_authority_ref: "external:service-secret-authority",
    schedule: "daily",
    compose_project: `blogxverify_${suffix}`,
    database_name: `blog_x_${suffix}`,
    media_root: "/var/lib/blog-x/media",
    config_inventory_sources: ["ops/production-config.names.json", "ops/topology-policy.json"],
  };
}

async function generatedRoot(context) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-backup-verify-"));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  return root;
}

async function collectComplete(stage) {
  const source = Buffer.from("source-bytes");
  const derivative = Buffer.from("derivative-bytes");
  await mkdir(join(stage, "media/source"), { recursive: true });
  await mkdir(join(stage, "media/derivative"), { recursive: true });
  await mkdir(join(stage, "config"), { recursive: true });
  await writeFile(join(stage, "database.dump"), Buffer.from("PGDMP-fixture"));
  await writeFile(join(stage, "portable-export-v1.json"), JSON.stringify({ format: "blog-x-portable-export", version: 1, exportedAt: "2026-08-09T10:00:00.000Z", articles: [], categories: [], tags: [], media: [], about: null }));
  await writeFile(join(stage, "media/source/11111111-1111-4111-8111-111111111111.bin"), source);
  await writeFile(join(stage, "media/derivative/11111111-1111-4111-8111-111111111111.webp"), derivative);
  await writeFile(join(stage, "config/inventory.json"), JSON.stringify({
    format: "blog-x-backup-config-inventory", version: 1,
    migration: { count: 6, fingerprint: "a".repeat(64) },
    images: { api: "sha256:" + "b".repeat(64), web: "sha256:" + "c".repeat(64), postgres: "sha256:" + "d".repeat(64) },
    configChecksums: [{ path: "ops/production-config.names.json", sha256: "e".repeat(64) }],
    variableNamesPresent: ["DATABASE_URL", "MEDIA_ROOT", "PUBLIC_ORIGIN"],
    mediaRootRole: "api-owned-source-and-derivative",
    secretAuthorityRef: "external:service-secret-authority",
    media: [{
      id: "11111111-1111-4111-8111-111111111111",
      sourcePath: "media/source/11111111-1111-4111-8111-111111111111.bin",
      derivativePath: "media/derivative/11111111-1111-4111-8111-111111111111.webp",
      sourceSha256: sha(source), derivativeSha256: sha(derivative),
    }],
  }));
}

test("policy and path validators reject broad, unresolved, traversal, and mismatched authority", async (context) => {
  const root = await generatedRoot(context);
  assert.equal(parseBackupPolicy(policy(root)).destination_root, root);
  assert.equal(validateBackupRoot(root), root);
  assert.equal(validateBackupSetId("20260809T100000Z-a1b2c3d4"), "20260809T100000Z-a1b2c3d4");
  for (const value of ["/", tmpdir(), process.cwd(), join(root, "../escape"), "${UNRESOLVED}"]) assert.throws(() => validateBackupRoot(value), /backup root/i);
  for (const override of [
    { compose_project: "blogxlocal" },
    { database_name: "blog_x_wrong" },
    { media_root: "/" },
    { retention_decision_ref: "" },
    { off_host_destination_ref: "same-host" },
  ]) assert.throws(() => parseBackupPolicy({ ...policy(root), ...override }), /backup policy/i);
});

test("manifest verification accepts exact complete bytes and rejects tamper, extras, missing marker, and links", async (context) => {
  const root = await generatedRoot(context);
  const result = await createBackupSet(policy(root), { setId: "20260809T100000Z-a1b2c3d4", collect: collectComplete, now: () => new Date("2026-08-09T10:00:00.000Z") });
  assert.equal((await verifyBackupSet(result.finalRoot)).manifest.format, "blog-x-backup-set");
  assert.match(await hashFile(join(result.finalRoot, "database.dump")), /^[a-f0-9]{64}$/);
  await writeFile(join(result.finalRoot, "database.dump"), "tampered");
  await assert.rejects(verifyBackupSet(result.finalRoot), /database\.dump.*(?:size|checksum)|(?:size|checksum).*database\.dump/i);

  const second = await createBackupSet(policy(root, "b1b2c3d4"), { setId: "20260809T100001Z-b1b2c3d4", collect: collectComplete });
  await writeFile(join(second.finalRoot, "extra.txt"), "extra");
  await assert.rejects(verifyBackupSet(second.finalRoot), /extra/i);
  const third = await createBackupSet(policy(root, "c1b2c3d4"), { setId: "20260809T100002Z-c1b2c3d4", collect: collectComplete });
  await rm(join(third.finalRoot, "COMPLETE"));
  await assert.rejects(verifyBackupSet(third.finalRoot), /COMPLETE/i);
  const linkRoot = join(root, "20260809T100003Z-d1b2c3d4");
  await mkdir(linkRoot);
  await symlink(join(root, "20260809T100002Z-c1b2c3d4", "manifest.json"), join(linkRoot, "manifest.json"));
  await assert.rejects(verifyBackupSet(linkRoot), /link|complete/i);
});

test("the rehearsal wrapper rejects a production-shaped root before shared member reads", async (context) => {
  const sourceBase = await mkdtemp(join(tmpdir(), "blog-x-production-source-"));
  context.after(async () => { await rm(sourceBase, { recursive: true, force: true }); });
  const productionRoot = join(sourceBase, "20260809T100004Z-a1b2c3d4");
  await mkdir(productionRoot, { mode: 0o700 });
  await writeFile(join(productionRoot, "sentinel-before-members"), "must-not-read");

  await assert.rejects(verifyBackupSet(productionRoot), /backup root|staging/i);
  await assert.rejects(verifyCompleteBackupSetContents(productionRoot), /root validator is required/i);
});

test("atomic creation writes COMPLETE last, preserves prior sets, and leaves a bounded staging root on failure", async (context) => {
  const root = await generatedRoot(context);
  const first = await createBackupSet(policy(root), { setId: "20260809T100010Z-a1b2c3d4", collect: collectComplete });
  assert.equal(first.message, "BACKUP COMPLETE 20260809T100010Z-a1b2c3d4");
  assert.equal((await readdir(first.finalRoot)).at(-1) !== undefined, true);
  const priorManifest = await readFile(join(first.finalRoot, "manifest.json"));
  await assert.rejects(createBackupSet(policy(root), { setId: "20260809T100010Z-a1b2c3d4", collect: collectComplete }), /exists|collision/i);
  assert.deepEqual(await readFile(join(first.finalRoot, "manifest.json")), priorManifest);
  let staging;
  await assert.rejects(createBackupSet(policy(root, "e1b2c3d4"), {
    setId: "20260809T100011Z-e1b2c3d4",
    collect: async (path) => { staging = path; await writeFile(join(path, "partial"), "partial"); throw new Error("collector failed"); },
  }), /collector failed/);
  assert.equal((await lstat(staging)).isDirectory(), true);
  assert.equal((await stat(join(staging, "partial"))).isFile(), true);
  assert.equal(await cleanupBackupStaging(staging), true);
  await assert.rejects(stat(staging), /ENOENT/);
});

test("parallel creators isolate staging and final roots", async (context) => {
  const root = await generatedRoot(context);
  const [left, right] = await Promise.all([
    createBackupSet(policy(root), { setId: "20260809T100020Z-a1b2c3d4", collect: collectComplete }),
    createBackupSet(policy(root, "b1b2c3d4"), { setId: "20260809T100021Z-b1b2c3d4", collect: collectComplete }),
  ]);
  assert.notEqual(left.finalRoot, right.finalRoot);
  await verifyBackupSet(left.finalRoot);
  await verifyBackupSet(right.finalRoot);
});

test("schedule and name-only contracts remain dormant until external decisions exist", async () => {
  const policyNames = JSON.parse(await readFile(new URL("../../ops/backup-policy.names.json", import.meta.url), "utf8"));
  assert.equal(policyNames.activation, "blocked-until-external-references");
  assert.equal(policyNames.fields.some((field) => Object.hasOwn(field, "value")), false);
  const service = await readFile(new URL("../../ops/systemd/blog-x-backup.service", import.meta.url), "utf8");
  const timer = await readFile(new URL("../../ops/systemd/blog-x-backup.timer", import.meta.url), "utf8");
  assert.match(service, /Type=oneshot/);
  assert.match(service, /UMask=0077/);
  assert.match(service, /ConditionPathExists=/);
  assert.match(timer, /OnCalendar=daily/);
  assert.match(timer, /Persistent=true/);
});

test("backup prohibition descriptor cannot call an incomplete set recoverable", async () => {
  const subjectPath = process.env.GSD_PROHIB_SUBJECT ?? new URL("../fixtures/prohibitions/backup-complete.json", import.meta.url);
  const subject = JSON.parse(await readFile(subjectPath, "utf8"));
  assert.deepEqual(Object.keys(subject).sort(), ["complete", "format", "hasConfig", "hasDatabase", "hasDerivativeMedia", "hasLogicalExport", "hasManifest", "hasSourceMedia", "version"]);
  assert.equal(subject.format, "blog-x-backup-descriptor");
  assert.equal(subject.version, 1);
  for (const key of ["complete", "hasConfig", "hasDatabase", "hasDerivativeMedia", "hasLogicalExport", "hasManifest", "hasSourceMedia"]) assert.equal(subject[key], true);
});
