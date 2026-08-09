import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { releaseEvidenceSchema } from "./release-gate/schema.mjs";
import { hashEvidenceArtifact, validateEvidenceBundleRoot } from "./release-gate/bundle.mjs";
import { evaluateReleaseReadiness, formatReleaseDecision, validateReleaseEvidence } from "./release-gate/validate.mjs";

const now = new Date("2026-08-09T12:00:00.000Z");
const observedAt = "2026-08-09T11:00:00.000Z";
const validUntil = "2026-08-09T18:00:00.000Z";
const sha = (value) => createHash("sha256").update(value).digest("hex");

function artifact(format, details) {
  return { format, version: 1, outcome: "pass", observedAt, details };
}

function artifactCatalog() {
  return {
    "authorization.json": artifact("blog-x-release-authorization", { authorizationRef: "approval:future-user-message", scope: "web-api-release", windowStartsAt: "2026-08-09T13:00:00.000Z", windowEndsAt: "2026-08-09T15:00:00.000Z" }),
    "host-main.json": artifact("blog-x-release-host-baseline", { role: "main", osSupported: true, resourcesReviewed: true, servicesReviewed: true, portsReviewed: true, firewallReviewed: true, edgePreservedUntilRelease: true }),
    "host-secondary.json": artifact("blog-x-release-host-baseline", { role: "secondary", osSupported: true, resourcesReviewed: true, servicesReviewed: true, portsReviewed: true, firewallReviewed: true, edgePreservedUntilRelease: true }),
    "network.json": artifact("blog-x-release-network-boundary", { browserSameOrigin: true, apiPublic: false, postgresPublic: false, encryptedPrivateLink: true }),
    "backup.json": artifact("blog-x-release-backup-restore", { completeBackup: true, dailyScheduled: true, lastCompleteBackupAt: "2026-08-09T10:00:00.000Z", isolatedRestorePassed: true, knownGoodRetained: true, offHostDestinationRef: "decision:off-host", retentionDecisionRef: "decision:retention", encryptionKeyAuthorityRef: "authority:backup-key", rpoDecisionRef: "decision:rpo", rtoDecisionRef: "decision:rto" }),
    "operations.json": artifact("blog-x-release-operations", { restartVerified: true, boundedLogs: true, resourceLimitsSelected: true, statusPassed: true, tlsCurrent: true, renewalVerified: true, alertRecipientRef: "decision:alerts" }),
    "rollback.json": artifact("blog-x-release-rollback", { priorWebDigest: `sha256:${"a".repeat(64)}`, priorApiDigest: `sha256:${"b".repeat(64)}`, edgeConfigSha256: "c".repeat(64), migrationCompatible: true, mediaPreserved: true, knownGoodBackup: true, ownerRef: "role:release-owner", stopCriteria: ["smoke-failure", "data-integrity-failure"], validationPassed: true }),
    "post-release.json": artifact("blog-x-release-post-release", { smokeChecks: ["https-entry", "published-article", "media", "admin-login"], decisionOwnerRef: "role:release-owner", rollbackDecisionRecorded: true }),
  };
}

function section(references) { return { status: "ready", references }; }

async function makeBundle(context, customize = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-release-evidence-"));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const catalog = artifactCatalog();
  const references = {};
  for (const [name, value] of Object.entries(catalog)) {
    const text = `${JSON.stringify(value)}\n`;
    await writeFile(join(root, name), text, { mode: 0o600 });
    references[name] = { id: name.replace(".json", ""), artifact: name, type: value.format, sha256: sha(text), observedAt, validUntil, outcome: "pass" };
  }
  const evidence = {
    format: "blog-x-release-evidence", version: 1, state: "READY",
    authorization: section([references["authorization.json"]]),
    hostBaselines: section([references["host-main.json"], references["host-secondary.json"]]),
    networkBoundary: section([references["network.json"]]),
    backupRestore: section([references["backup.json"]]), operations: section([references["operations.json"]]),
    rollback: section([references["rollback.json"]]), postRelease: section([references["post-release.json"]]),
  };
  await customize({ root, catalog, references, evidence });
  await writeFile(join(root, "evidence.json"), `${JSON.stringify(evidence)}\n`, { mode: 0o600 });
  return { root, evidence, references };
}

test("canonical repository evidence is strict BLOCKED and expect-blocked succeeds without artifact locators", async () => {
  const canonicalPath = join(process.cwd(), "ops/release-evidence.blocked.json");
  const canonicalText = await readFile(canonicalPath, "utf8");
  const canonical = releaseEvidenceSchema.parse(JSON.parse(canonicalText));
  const decision = await validateReleaseEvidence(canonical, { now: () => now, expectBlocked: true, canonical: true });
  assert.equal(decision.status, "BLOCKED");
  assert.equal(decision.exitCode, 0);
  assert.match(formatReleaseDecision(decision), /^RELEASE BLOCKED/);
  assert.doesNotMatch(canonicalText, /artifact|READY|synthetic|authorizationRef/i);
  const normal = await validateReleaseEvidence(canonical, { now: () => now, canonical: true });
  assert.equal(normal.exitCode, 1);
  assert.ok(normal.reasons.length >= 20);
  assert.deepEqual(normal.reasons, [...normal.reasons].sort());
});

test("only a complete current byte-bound synthetic bundle reaches READY", async (context) => {
  const bundle = await makeBundle(context);
  assert.equal(validateEvidenceBundleRoot(bundle.root), bundle.root);
  assert.match(await hashEvidenceArtifact(join(bundle.root, "authorization.json")), /^[a-f0-9]{64}$/);
  const decision = await validateReleaseEvidence(bundle.evidence, { bundleRoot: bundle.root, evidencePath: "evidence.json", now: () => now });
  assert.deepEqual(decision, { status: "READY", exitCode: 0, reasons: [] });
  assert.equal(formatReleaseDecision(decision), "RELEASE READY");
});

test("each missing prerequisite remains BLOCKED rather than becoming implicit authority", async (context) => {
  for (const key of ["authorization", "hostBaselines", "networkBoundary", "backupRestore", "operations", "rollback", "postRelease"]) {
    const bundle = await makeBundle(context, async ({ evidence }) => { evidence[key] = { status: "pending", unresolved: [`${key}.missing`] }; });
    const decision = await validateReleaseEvidence(bundle.evidence, { bundleRoot: bundle.root, evidencePath: "evidence.json", now: () => now });
    assert.equal(decision.status, "BLOCKED", key);
    assert.equal(decision.exitCode, 1, key);
    assert.deepEqual(decision.reasons, [`${key}.missing`]);
  }
});

test("malformed paths, bytes, time, links, extras, secrets, and public/internal authority are INVALID and redacted", async (context) => {
  const cases = [
    async ({ references }) => { references["authorization.json"].artifact = "../escape.json"; },
    async ({ references }) => { references["authorization.json"].sha256 = "0".repeat(64); },
    async ({ references }) => { references["authorization.json"].validUntil = "2026-08-09T10:00:00.000Z"; },
    async ({ references }) => { references["authorization.json"].observedAt = "2026-08-10T10:00:00.000Z"; },
    async ({ root }) => { await writeFile(join(root, "extra.json"), "{}\n"); },
    async ({ root, catalog, references }) => { const text = `${JSON.stringify({ ...catalog["network.json"], details: { ...catalog["network.json"].details, apiPublic: true } })}\n`; await writeFile(join(root, "network.json"), text); references["network.json"].sha256 = sha(text); },
    async ({ root, catalog, references }) => { const text = `${JSON.stringify({ ...catalog["authorization.json"], details: { ...catalog["authorization.json"].details, authorizationRef: "password=do-not-print-this" } })}\n`; await writeFile(join(root, "authorization.json"), text); references["authorization.json"].sha256 = sha(text); },
    async ({ root, catalog, references }) => { const text = `${JSON.stringify({ ...catalog["network.json"], details: { ...catalog["network.json"].details, note: "http://api:3001" } })}\n`; await writeFile(join(root, "network.json"), text); references["network.json"].sha256 = sha(text); },
  ];
  for (const customize of cases) {
    const bundle = await makeBundle(context, customize);
    const decision = await evaluateReleaseReadiness(bundle.evidence, { bundleRoot: bundle.root, evidencePath: "evidence.json", now: () => now });
    assert.equal(decision.status, "INVALID");
    assert.equal(decision.exitCode, 2);
    assert.doesNotMatch(formatReleaseDecision(decision), /do-not-print|api:3001|escape\.json/i);
  }
  const linked = await makeBundle(context);
  await rm(join(linked.root, "authorization.json"));
  await symlink(join(linked.root, "host-main.json"), join(linked.root, "authorization.json"));
  const linkDecision = await evaluateReleaseReadiness(linked.evidence, { bundleRoot: linked.root, evidencePath: "evidence.json", now: () => now });
  assert.equal(linkDecision.exitCode, 2);
});

test("validation is pure under parallel evaluation and CLI has exact blocked outcomes", async (context) => {
  const before = await readFile(join(process.cwd(), "ops/release-evidence.blocked.json"));
  const bundles = await Promise.all([makeBundle(context), makeBundle(context)]);
  const results = await Promise.all(bundles.map((bundle) => validateReleaseEvidence(bundle.evidence, { bundleRoot: bundle.root, evidencePath: "evidence.json", now: () => now })));
  assert.deepEqual(results.map((item) => item.status), ["READY", "READY"]);
  assert.deepEqual(await readFile(join(process.cwd(), "ops/release-evidence.blocked.json")), before);
  const normal = spawnSync(process.execPath, ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(normal.status, 1); assert.match(normal.stdout, /^RELEASE BLOCKED/);
  const expected = spawnSync(process.execPath, ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json", "--expect-blocked"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(expected.status, 0); assert.match(expected.stdout, /^RELEASE BLOCKED/);
});

test("release prohibition descriptor rejects automatic capability and tracked READY state", async () => {
  const subjectPath = process.env.GSD_PROHIB_SUBJECT ?? join(process.cwd(), "ops/release-evidence.blocked.json");
  const subject = JSON.parse(await readFile(subjectPath, "utf8"));
  assert.equal(subject.format, "blog-x-release-evidence");
  assert.equal(subject.version, 1);
  assert.equal(subject.state, "BLOCKED");
  assert.equal("automaticUnfreeze" in subject, false);
  assert.equal("remoteCapability" in subject, false);
  releaseEvidenceSchema.parse(subject);
});
