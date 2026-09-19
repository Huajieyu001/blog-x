import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assemblePreReleaseEvidence } from "./assemble.mjs";

const now = new Date("2026-08-10T12:00:00.000Z");
const observedAt = "2026-08-10T11:00:00.000Z";
const validUntil = "2026-08-10T18:00:00.000Z";
const digest = (letter) => `sha256:${letter.repeat(64)}`;
const sha = (value) => createHash("sha256").update(value).digest("hex");

function artifact(format, details, outcome = "pass") {
  return { format, version: 1, outcome, observedAt, validUntil, details };
}

function backupDetails() {
  return {
    alert: { confirmed: true },
    collector: { collectedAt: "2026-08-10T10:30:00.000Z", configImageMigrationInventory: true, database: true, derivativeMedia: true, portableExport: true, scope: "service-production-pipeline", sourceMedia: true },
    independentRestore: { manifestSha256: "a".repeat(64), passed: true },
    mounted: { authenticatedCiphertext: true, receiptBound: true, receiptSha256: "b".repeat(64) },
    productionResult: { alertOutcome: "recorded", ciphertextSha256: "c".repeat(64), createdAt: "2026-08-10T10:30:00.000Z", destinationProfileId: "future-mount-profile", format: "blog-x-production-backup-result", manifestSha256: "a".repeat(64), receiptSha256: "b".repeat(64), retention: { kept: 1, deletedSetIds: [] }, scope: "service-production-pipeline", setId: "20260810T103000Z-a1b2c3d4", status: "complete", version: 1 },
    retention: { safe: true },
  };
}

function catalog() {
  return {
    "authorization.json": artifact("blog-x-release-authorization", { authorizationRef: "approval:future-user-message", scope: "web-api-release", windowEndsAt: "2026-08-10T15:00:00.000Z", windowStartsAt: "2026-08-10T13:00:00.000Z" }),
    "host-main.json": artifact("blog-x-release-host-baseline", { edgePreservedUntilRelease: true, firewallReviewed: true, osSupported: true, portsReviewed: true, resourcesReviewed: true, role: "main", servicesReviewed: true }),
    "host-secondary.json": artifact("blog-x-release-host-baseline", { edgePreservedUntilRelease: true, firewallReviewed: true, osSupported: true, portsReviewed: true, resourcesReviewed: true, role: "secondary", servicesReviewed: true }),
    "network.json": artifact("blog-x-release-network-boundary", { apiPublic: false, browserSameOrigin: true, encryptedPrivateLink: true, postgresPublic: false }),
    "backup.json": artifact("blog-x-release-backup-restore", backupDetails()),
    "operations.json": artifact("blog-x-release-operations", { alertRecipientRef: "decision:alerts", boundedLogs: true, renewalVerified: true, resourceLimitsSelected: true, restartVerified: true, statusPassed: true, tlsCurrent: true }),
    "rollback.json": artifact("blog-x-release-rollback", { edgeConfigSha256: "d".repeat(64), knownGoodBackup: true, mediaPreserved: true, migrationCompatible: true, ownerRef: "role:release-owner", priorApiDigest: digest("e"), priorWebDigest: digest("f"), stopCriteria: ["smoke-failure", "data-integrity-failure"], validationPassed: true }),
  };
}

async function makeBundle(context) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-release-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const values = catalog();
  const raw = {};
  for (const [name, value] of Object.entries(values)) {
    raw[name] = `${JSON.stringify(value)}\n`;
    await writeFile(join(root, name), raw[name], { mode: 0o600 });
  }
  return { root, raw, values };
}

test("valid evidence bundle is assembled only after the existing gate is ready", async (context) => {
  const bundle = await makeBundle(context);
  const result = await assemblePreReleaseEvidence({ bundleRoot: bundle.root, now: () => now });
  assert.equal(result.status, "PRE_RELEASE_READY");
  const evidencePath = join(bundle.root, "evidence.json");
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.equal((await lstat(evidencePath)).mode & 0o777, 0o600);
  assert.equal(evidence.hostBaselines.references[0].artifact, "host-main.json");
  assert.equal(evidence.hostBaselines.references[1].artifact, "host-secondary.json");
  assert.equal(evidence.authorization.references[0].sha256, sha(bundle.raw["authorization.json"]));
  assert.deepEqual(evidence.backupRestore.references[0].validUntil, validUntil);
  assert.equal(await readFile(join(bundle.root, "authorization.json"), "utf8"), bundle.raw["authorization.json"]);
});

test("offline package command emits only the gate decision", async (context) => {
  const bundle = await makeBundle(context);
  const currentObserved = new Date(Date.now() - 120_000).toISOString();
  const currentValidUntil = new Date(Date.now() + 3_600_000).toISOString();
  const currentCollector = new Date(Date.now() - 300_000).toISOString();
  for (const [name, value] of Object.entries(bundle.values)) {
    value.observedAt = currentObserved;
    value.validUntil = currentValidUntil;
    if (name === "backup.json") {
      value.details.collector.collectedAt = currentCollector;
      value.details.productionResult.createdAt = currentCollector;
    }
    await writeFile(join(bundle.root, name), `${JSON.stringify(value)}\n`, { mode: 0o600 });
  }
  const result = spawnSync("corepack", ["pnpm", "production:evidence:assemble", "--", `--bundle-root=${bundle.root}`], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "RELEASE PRE_RELEASE_READY\n");
  assert.match(result.stderr, /^\$ node scripts\/release-gate\/assemble\.mjs -- --bundle-root=/);
});

test("artifact validity window and exact source binding fail closed", async (context) => {
  const bundle = await makeBundle(context);
  const stale = { ...bundle.values["authorization.json"], validUntil: "2026-08-10T11:30:00.000Z" };
  await writeFile(join(bundle.root, "authorization.json"), `${JSON.stringify(stale)}\n`, { mode: 0o600 });
  const result = await assemblePreReleaseEvidence({ bundleRoot: bundle.root, now: () => now });
  assert.equal(result.status, "INVALID");
  await assert.rejects(lstat(join(bundle.root, "evidence.json")));
});

test("missing, extra, linked, unsafe, malformed, failed, and oversized facts fail closed", async (context) => {
  const cases = [
    async (bundle) => unlink(join(bundle.root, "network.json")),
    async (bundle) => writeFile(join(bundle.root, "extra.json"), "{}\n", { mode: 0o600 }),
    async (bundle) => { await unlink(join(bundle.root, "network.json")); await symlink("authorization.json", join(bundle.root, "network.json")); },
    async (bundle) => chmod(join(bundle.root, "network.json"), 0o644),
    async (bundle) => writeFile(join(bundle.root, "network.json"), "{\n", { mode: 0o600 }),
    async (bundle) => writeFile(join(bundle.root, "network.json"), `${JSON.stringify({ ...bundle.values["network.json"], outcome: "fail" })}\n`, { mode: 0o600 }),
    async (bundle) => writeFile(join(bundle.root, "network.json"), " ".repeat(256 * 1024 + 1), { mode: 0o600 }),
  ];
  for (const prepare of cases) {
    const bundle = await makeBundle(context);
    await prepare(bundle);
    const result = await assemblePreReleaseEvidence({ bundleRoot: bundle.root, now: () => now });
    assert.notEqual(result.status, "PRE_RELEASE_READY");
    await assert.rejects(lstat(join(bundle.root, "evidence.json")));
    assert.deepEqual((await readdir(bundle.root)).filter((name) => name.startsWith("candidate-evidence-")), []);
  }
});

test("non-private generated bundle roots are rejected before any candidate is written", async (context) => {
  const bundle = await makeBundle(context);
  await chmod(bundle.root, 0o755);
  const result = await assemblePreReleaseEvidence({ bundleRoot: bundle.root, now: () => now });
  assert.equal(result.status, "INVALID");
  await assert.rejects(lstat(join(bundle.root, "evidence.json")));
  await chmod(bundle.root, 0o700);
});

test("tampering and output collisions preserve existing bytes and cannot return ready", async (context) => {
  const tampered = await makeBundle(context);
  const tamper = await assemblePreReleaseEvidence({
    bundleRoot: tampered.root,
    now: () => now,
    beforeCandidateEvaluation: async () => writeFile(join(tampered.root, "authorization.json"), "{}\n", { mode: 0o600 }),
  });
  assert.equal(tamper.status, "INVALID");
  await assert.rejects(lstat(join(tampered.root, "evidence.json")));

  const collision = await makeBundle(context);
  const preserved = "operator-owned-content\n";
  await writeFile(join(collision.root, "evidence.json"), preserved, { mode: 0o600 });
  const result = await assemblePreReleaseEvidence({ bundleRoot: collision.root, now: () => now });
  assert.equal(result.status, "INVALID");
  assert.equal(await readFile(join(collision.root, "evidence.json"), "utf8"), preserved);
});

test("concurrent evidence creation and final source mutation fail without partial publication", async (context) => {
  const collision = await makeBundle(context);
  const preserved = "concurrent-owner-output\n";
  const collided = await assemblePreReleaseEvidence({
    bundleRoot: collision.root,
    now: () => now,
    beforePublish: async ({ root }) => writeFile(join(root, "evidence.json"), preserved, { mode: 0o600 }),
  });
  assert.equal(collided.status, "INVALID");
  assert.equal(await readFile(join(collision.root, "evidence.json"), "utf8"), preserved);
  assert.deepEqual((await readdir(collision.root)).filter((name) => name.startsWith("candidate-evidence-")), []);

  const changed = await makeBundle(context);
  const result = await assemblePreReleaseEvidence({
    bundleRoot: changed.root,
    now: () => now,
    beforeFinalEvaluation: async ({ root }) => writeFile(join(root, "network.json"), "{}\n", { mode: 0o600 }),
  });
  assert.equal(result.status, "INVALID");
  await assert.rejects(lstat(join(changed.root, "evidence.json")));
});
