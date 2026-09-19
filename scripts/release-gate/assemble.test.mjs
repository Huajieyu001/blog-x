import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("artifact validity window and exact source binding fail closed", async (context) => {
  const bundle = await makeBundle(context);
  const stale = { ...bundle.values["authorization.json"], validUntil: "2026-08-10T11:30:00.000Z" };
  await writeFile(join(bundle.root, "authorization.json"), `${JSON.stringify(stale)}\n`, { mode: 0o600 });
  const result = await assemblePreReleaseEvidence({ bundleRoot: bundle.root, now: () => now });
  assert.equal(result.status, "INVALID");
  await assert.rejects(lstat(join(bundle.root, "evidence.json")));
});
