import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { postReleaseEvidenceSchema, preReleaseEvidenceSchema, releaseEvidenceSchema } from "./release-gate/schema.mjs";
import { evaluatePostReleaseVerification, evaluatePreReleaseReadiness, formatReleaseDecision, validateReleaseEvidence } from "./release-gate/validate.mjs";

const now = new Date("2026-08-10T12:00:00.000Z");
const observedAt = "2026-08-10T11:00:00.000Z";
const validUntil = "2026-08-10T18:00:00.000Z";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const digest = (letter) => `sha256:${letter.repeat(64)}`;

function artifact(format, details, outcome = "pass") {
  return { format, version: 1, outcome, observedAt, details };
}

function reference(name, value, text) {
  return { id: name.replace(/\.json$/, ""), artifact: name, type: value.format, sha256: sha(text), observedAt, validUntil, outcome: value.outcome ?? "pass" };
}

function section(references) {
  return { status: "ready", references };
}

function backupDetails(scope = "service-production-pipeline") {
  return {
    alert: { confirmed: true },
    collector: {
      collectedAt: "2026-08-10T10:30:00.000Z",
      configImageMigrationInventory: true,
      database: true,
      derivativeMedia: true,
      portableExport: true,
      scope,
      sourceMedia: true,
    },
    independentRestore: { manifestSha256: "a".repeat(64), passed: true },
    mounted: { authenticatedCiphertext: true, receiptBound: true, receiptSha256: "b".repeat(64) },
    productionResult: {
      alertOutcome: "recorded",
      ciphertextSha256: "c".repeat(64),
      createdAt: "2026-08-10T10:30:00.000Z",
      destinationProfileId: "future-mount-profile",
      format: "blog-x-production-backup-result",
      manifestSha256: "a".repeat(64),
      receiptSha256: "b".repeat(64),
      retention: { kept: 1, deletedSetIds: [] },
      scope,
      setId: "20260810T103000Z-a1b2c3d4",
      status: "complete",
      version: 1,
    },
    retention: { safe: true },
  };
}

function catalog(scope) {
  return {
    "authorization.json": artifact("blog-x-release-authorization", { authorizationRef: "approval:future-user-message", scope: "web-api-release", windowEndsAt: "2026-08-10T15:00:00.000Z", windowStartsAt: "2026-08-10T13:00:00.000Z" }),
    "host-main.json": artifact("blog-x-release-host-baseline", { edgePreservedUntilRelease: true, firewallReviewed: true, osSupported: true, portsReviewed: true, resourcesReviewed: true, role: "main", servicesReviewed: true }),
    "host-secondary.json": artifact("blog-x-release-host-baseline", { edgePreservedUntilRelease: true, firewallReviewed: true, osSupported: true, portsReviewed: true, resourcesReviewed: true, role: "secondary", servicesReviewed: true }),
    "network.json": artifact("blog-x-release-network-boundary", { apiPublic: false, browserSameOrigin: true, encryptedPrivateLink: true, postgresPublic: false }),
    "backup.json": artifact("blog-x-release-backup-restore", backupDetails(scope)),
    "operations.json": artifact("blog-x-release-operations", { alertRecipientRef: "decision:alerts", boundedLogs: true, renewalVerified: true, resourceLimitsSelected: true, restartVerified: true, statusPassed: true, tlsCurrent: true }),
    "rollback.json": artifact("blog-x-release-rollback", { edgeConfigSha256: "d".repeat(64), knownGoodBackup: true, mediaPreserved: true, migrationCompatible: true, ownerRef: "role:release-owner", priorApiDigest: digest("e"), priorWebDigest: digest("f"), stopCriteria: ["smoke-failure", "data-integrity-failure"], validationPassed: true }),
  };
}

async function makePreBundle(context, { scope = "service-production-pipeline", mutate } = {}) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-release-evidence-"));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const values = catalog(scope);
  const references = {};
  for (const [name, value] of Object.entries(values)) {
    const text = `${JSON.stringify(value)}\n`;
    await writeFile(join(root, name), text, { mode: 0o600 });
    references[name] = reference(name, value, text);
  }
  const evidence = {
    authorization: section([references["authorization.json"]]),
    backupRestore: section([references["backup.json"]]),
    format: "blog-x-release-evidence",
    hostBaselines: section([references["host-main.json"], references["host-secondary.json"]]),
    networkBoundary: section([references["network.json"]]),
    operations: section([references["operations.json"]]),
    rollback: section([references["rollback.json"]]),
    state: "PRE_RELEASE_READY",
    version: 2,
  };
  await mutate?.({ evidence, references, root, values });
  const evidenceText = `${JSON.stringify(evidence)}\n`;
  await writeFile(join(root, "evidence.json"), evidenceText, { mode: 0o600 });
  return { evidence, evidenceText, references, root, values };
}

async function makePostBundle(context, options = {}) {
  const pre = await makePreBundle(context, options);
  const preDecision = await evaluatePreReleaseReadiness(pre.evidence, { bundleRoot: pre.root, evidencePath: "evidence.json", now: () => now });
  assert.equal(preDecision.status, "PRE_RELEASE_READY");
  const decision = {
    decisionId: preDecision.decisionId,
    evidenceSha256: preDecision.evidenceSha256,
    format: "blog-x-pre-release-decision",
    issuedAt: observedAt,
    state: "PRE_RELEASE_READY",
    validUntil,
    version: 1,
  };
  const decisionText = `${JSON.stringify(decision)}\n`;
  await writeFile(join(pre.root, "pre-decision.json"), decisionText, { mode: 0o600 });
  const post = artifact("blog-x-release-post-release", {
    continueOrRollback: "continue",
    deployedApiDigest: digest("1"),
    deployedWebDigest: digest("2"),
    smoke: { adminLogin: true, homepage: true, media: true, publicArticle: true },
  });
  const postText = `${JSON.stringify(post)}\n`;
  await writeFile(join(pre.root, "post-release.json"), postText, { mode: 0o600 });
  const evidence = {
    format: "blog-x-post-release-evidence",
    postRelease: section([reference("post-release.json", post, postText)]),
    predecessor: {
      decision: reference("pre-decision.json", decision, decisionText),
      evidence: { ...reference("evidence.json", { ...pre.evidence, format: "blog-x-release-evidence", outcome: "pass" }, pre.evidenceText), type: "blog-x-release-evidence" },
      status: "bound",
    },
    state: "POST_RELEASE_VERIFIED",
    version: 2,
  };
  await options.mutatePost?.({ decision, evidence, post, pre });
  const evidenceText = `${JSON.stringify(evidence)}\n`;
  await writeFile(join(pre.root, "post-evidence.json"), evidenceText, { mode: 0o600 });
  return { ...pre, decision, evidence, post };
}

test("canonical v2 evidence is locator-free BLOCKED and expect-blocked succeeds", async () => {
  const text = await readFile(join(process.cwd(), "ops/release-evidence.blocked.json"), "utf8");
  const canonical = releaseEvidenceSchema.parse(JSON.parse(text));
  const decision = await validateReleaseEvidence(canonical, { canonical: true, expectBlocked: true, now: () => now });
  assert.deepEqual(decision.status, "BLOCKED");
  assert.equal(decision.exitCode, 0);
  assert.doesNotMatch(text, /"artifact"\s*:|PRE_RELEASE_READY|POST_RELEASE_VERIFIED|https?:\/\//i);
});

test("complete current pre-release evidence reaches PRE_RELEASE_READY without post-release evidence", async (context) => {
  const bundle = await makePreBundle(context);
  preReleaseEvidenceSchema.parse(bundle.evidence);
  assert.equal("postRelease" in bundle.evidence, false);
  const decision = await evaluatePreReleaseReadiness(bundle.evidence, { bundleRoot: bundle.root, evidencePath: "evidence.json", now: () => now });
  assert.equal(decision.status, "PRE_RELEASE_READY");
  assert.equal(decision.exitCode, 0);
  assert.match(decision.decisionId, /^pre-release-[a-f0-9]{24}$/);
  assert.match(decision.evidenceSha256, /^[a-f0-9]{64}$/);
  assert.equal(formatReleaseDecision(decision), "RELEASE PRE_RELEASE_READY");
});

test("every generated collector, mount, and fake scope blocks pre-release readiness", async (context) => {
  for (const scope of ["generated-production-pipeline", "generated-mounted-fixture", "generated-fake"]) {
    const bundle = await makePreBundle(context, { scope });
    const decision = await evaluatePreReleaseReadiness(bundle.evidence, { bundleRoot: bundle.root, evidencePath: "evidence.json", now: () => now });
    assert.deepEqual(decision, { status: "BLOCKED", exitCode: 1, reasons: ["backupRestore.generated_scope"] });
  }
});

test("post verification blocks without a predecessor and rejects wrong, tampered, or stale bindings", async (context) => {
  const absent = {
    format: "blog-x-post-release-evidence",
    postRelease: { status: "pending", unresolved: ["predecessor.missing"] },
    predecessor: { status: "pending", unresolved: ["predecessor.missing"] },
    state: "POST_RELEASE_VERIFIED",
    version: 2,
  };
  assert.deepEqual(await evaluatePostReleaseVerification(absent, { now: () => now }), { status: "BLOCKED", exitCode: 1, reasons: ["predecessor.missing"] });
  for (const mutatePost of [
    ({ evidence }) => { evidence.predecessor.decision.sha256 = "0".repeat(64); },
    ({ evidence }) => { evidence.predecessor.decision.validUntil = "2026-08-10T10:00:00.000Z"; },
  ]) {
    const bundle = await makePostBundle(context, { mutatePost });
    const decision = await evaluatePostReleaseVerification(bundle.evidence, { bundleRoot: bundle.root, evidencePath: "post-evidence.json", now: () => now });
    assert.equal(decision.status, "INVALID");
    assert.equal(decision.exitCode, 2);
  }
  const mismatched = await makePostBundle(context);
  mismatched.decision.decisionId = "pre-release-000000000000000000000000";
  const decisionText = `${JSON.stringify(mismatched.decision)}\n`;
  await writeFile(join(mismatched.root, "pre-decision.json"), decisionText, { mode: 0o600 });
  mismatched.evidence.predecessor.decision = reference("pre-decision.json", mismatched.decision, decisionText);
  await writeFile(join(mismatched.root, "post-evidence.json"), `${JSON.stringify(mismatched.evidence)}\n`, { mode: 0o600 });
  const mismatchDecision = await evaluatePostReleaseVerification(mismatched.evidence, { bundleRoot: mismatched.root, evidencePath: "post-evidence.json", now: () => now });
  assert.equal(mismatchDecision.status, "INVALID");
  assert.equal(mismatchDecision.exitCode, 2);
});

test("failed HTTPS-domain smoke is a recorded post-release non-success, not an invalid predecessor", async (context) => {
  const bundle = await makePostBundle(context, { mutatePost: ({ evidence, post }) => {
    post.outcome = "fail";
    post.details.smoke.media = false;
    const text = `${JSON.stringify(post)}\n`;
    evidence.postRelease.references[0] = reference("post-release.json", post, text);
  } });
  await writeFile(join(bundle.root, "post-release.json"), `${JSON.stringify(bundle.post)}\n`, { mode: 0o600 });
  postReleaseEvidenceSchema.parse(bundle.evidence);
  const decision = await evaluatePostReleaseVerification(bundle.evidence, { bundleRoot: bundle.root, evidencePath: "post-evidence.json", now: () => now });
  assert.equal(decision.status, "POST_RELEASE_FAILED");
  assert.equal(decision.exitCode, 1);
  assert.deepEqual(decision.reasons, ["postRelease.smoke"]);
});

test("exact byte-bound predecessor, deployed digests, HTTPS smoke, and continue decision reach POST_RELEASE_VERIFIED", async (context) => {
  const bundle = await makePostBundle(context);
  postReleaseEvidenceSchema.parse(bundle.evidence);
  const decision = await evaluatePostReleaseVerification(bundle.evidence, { bundleRoot: bundle.root, evidencePath: "post-evidence.json", now: () => now });
  assert.equal(decision.status, "POST_RELEASE_VERIFIED");
  assert.equal(decision.exitCode, 0);
  assert.equal(decision.predecessorDecisionId, bundle.decision.decisionId);
  assert.equal(formatReleaseDecision(decision), "RELEASE POST_RELEASE_VERIFIED");
});

test("CLI offers mutually exclusive expectation-only flags and no transition capability", () => {
  const canonical = spawnSync(process.execPath, ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json", "--expect-blocked"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(canonical.status, 0);
  assert.match(canonical.stdout, /^RELEASE BLOCKED/);
  const invalid = spawnSync(process.execPath, ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json", "--expect-blocked", "--expect-pre-release-ready"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.doesNotMatch(invalid.stdout, /deploy|transition|unfreeze|rollback/i);
});

test("named sequence controls remain data-only and pin the non-circular state machine", async () => {
  const circular = JSON.parse(await readFile(join(process.cwd(), "scripts/fixtures/prohibitions/release-sequence-circular.json"), "utf8"));
  const linear = JSON.parse(await readFile(join(process.cwd(), "scripts/fixtures/prohibitions/release-sequence-linear.json"), "utf8"));
  assert.deepEqual(circular, { expectedPreDecision: "PRE_RELEASE_READY", expectedPostWithoutPredecessor: "BLOCKED", id: "release-sequence-circular", version: 1 });
  assert.deepEqual(linear, { expectedPostDecision: "POST_RELEASE_VERIFIED", id: "release-sequence-linear", requiresActualBytePredecessor: true, version: 1 });
});
