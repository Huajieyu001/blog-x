import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectProductionReadiness, formatProductionReadinessReport, runProductionReadinessCli } from "./production-readiness.mjs";
import { assertLocalDeliveryEvidenceSchema } from "../refresh-local-runtime-core.mjs";

const sha = (character) => character.repeat(40);
const receiptRevision = "509b75c23e0e0af22272493cc8df32280444057d";
const now = new Date("2026-08-10T12:00:00.000Z");
const observedAt = "2026-08-10T11:00:00.000Z";
const validUntil = "2026-08-10T18:00:00.000Z";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const image = (value) => `sha256:${value.repeat(64)}`;

function artifact(format, details) { return { format, version: 1, outcome: "pass", observedAt, details }; }
function reference(name, value, text) { return { id: name.slice(0, -5), artifact: name, type: value.format, sha256: digest(text), observedAt, validUntil, outcome: "pass" }; }
async function readyBundle(context, { scope = "service-production-pipeline", extra = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-release-evidence-")); context.after(() => rm(root, { recursive: true, force: true }));
  const backup = artifact("blog-x-release-backup-restore", { alert: { confirmed: true }, collector: { collectedAt: "2026-08-10T10:30:00.000Z", configImageMigrationInventory: true, database: true, derivativeMedia: true, portableExport: true, scope, sourceMedia: true }, independentRestore: { manifestSha256: "a".repeat(64), passed: true }, mounted: { authenticatedCiphertext: true, receiptBound: true, receiptSha256: "b".repeat(64) }, productionResult: { alertOutcome: "recorded", ciphertextSha256: "c".repeat(64), createdAt: "2026-08-10T10:30:00.000Z", destinationProfileId: "future-mount-profile", format: "blog-x-production-backup-result", manifestSha256: "a".repeat(64), receiptSha256: "b".repeat(64), retention: { kept: 1, deletedSetIds: [] }, scope, setId: "20260810T103000Z-a1b2c3d4", status: "complete", version: 1 }, retention: { safe: true } });
  const values = {
    "authorization.json": artifact("blog-x-release-authorization", { authorizationRef: "approval:future-user-message", scope: "web-api-release", windowEndsAt: "2026-08-10T15:00:00.000Z", windowStartsAt: "2026-08-10T13:00:00.000Z" }),
    "host-main.json": artifact("blog-x-release-host-baseline", { edgePreservedUntilRelease: true, firewallReviewed: true, osSupported: true, portsReviewed: true, resourcesReviewed: true, role: "main", servicesReviewed: true }),
    "host-secondary.json": artifact("blog-x-release-host-baseline", { edgePreservedUntilRelease: true, firewallReviewed: true, osSupported: true, portsReviewed: true, resourcesReviewed: true, role: "secondary", servicesReviewed: true }),
    "network.json": artifact("blog-x-release-network-boundary", { apiPublic: false, browserSameOrigin: true, encryptedPrivateLink: true, postgresPublic: false }),
    "backup.json": backup,
    "operations.json": artifact("blog-x-release-operations", { alertRecipientRef: "decision:alerts", boundedLogs: true, renewalVerified: true, resourceLimitsSelected: true, restartVerified: true, statusPassed: true, tlsCurrent: true }),
    "rollback.json": artifact("blog-x-release-rollback", { edgeConfigSha256: "d".repeat(64), knownGoodBackup: true, mediaPreserved: true, migrationCompatible: true, ownerRef: "role:release-owner", priorApiDigest: image("e"), priorWebDigest: image("f"), stopCriteria: ["smoke-failure", "data-integrity-failure"], validationPassed: true }),
  };
  const refs = {};
  for (const [name, value] of Object.entries(values)) { const text = `${JSON.stringify(value)}\n`; await writeFile(join(root, name), text); refs[name] = reference(name, value, text); }
  const section = (refs) => ({ status: "ready", references: refs });
  const evidence = { format: "blog-x-release-evidence", version: 2, state: "PRE_RELEASE_READY", authorization: section([refs["authorization.json"]]), hostBaselines: section([refs["host-main.json"], refs["host-secondary.json"]]), networkBoundary: section([refs["network.json"]]), backupRestore: section([refs["backup.json"]]), operations: section([refs["operations.json"]]), rollback: section([refs["rollback.json"]]) };
  await writeFile(join(root, "evidence.json"), `${JSON.stringify(evidence)}\n`); if (extra) await writeFile(join(root, "extra.json"), "{}\n");
  return root;
}

function gitFixture({ branch = "refs/heads/dev", clean = true, ancestor = true, deployChanged = false, receipt = receiptRevision } = {}) {
  const calls = [];
  return {
    calls,
    run: async (command, args) => {
      calls.push({ command, args: [...args] });
      assert.equal(command, "git");
      const joined = args.join(" ");
      if (joined === "symbolic-ref --quiet HEAD") return { stdout: `${branch}\n` };
      if (joined === "rev-parse HEAD") return { stdout: `${sha("b")}\n` };
      if (joined === "status --porcelain") return { stdout: clean ? "" : " M hostile-secret.txt\n" };
      if (joined === "log --format=%H --diff-filter=A --name-only -- ops/local-deliveries") return { stdout: `${receipt}\nops/local-deliveries/${receipt}.json\n` };
      if (args[0] === "ls-files" && args[1] === "-z") return { stdout: "deploy/primary/deploy.sh\0deploy/secondary/deploy.sh\0" };
      if (args[0] === "ls-files") return { stdout: "" };
      if (args[0] === "merge-base") { if (ancestor) return { stdout: "" }; throw new Error("not ancestor"); }
      if (args[0] === "diff") { if (deployChanged) throw new Error("changed"); return { stdout: "" }; }
      throw new Error("unexpected git call");
    },
  };
}

function baseOptions(overrides = {}) {
  const fixture = gitFixture(overrides);
  const revision = receiptRevision;
  return {
    root: process.cwd(),
    run: fixture.run,
    readFile: async (path, encoding) => {
      if (String(path).endsWith(`${revision}.json`)) return await import("node:fs/promises").then(({ readFile }) => readFile(`ops/local-deliveries/${revision}.json`, encoding));
      if (String(path).endsWith("release-evidence.blocked.json")) return JSON.stringify({ format: "blog-x-release-evidence", version: 2, state: "BLOCKED", authorization: { status: "pending", unresolved: ["authorization.change_window"] }, hostBaselines: { status: "pending", unresolved: ["host.main_baseline"] }, networkBoundary: { status: "pending", unresolved: ["network.private_link"] }, backupRestore: { status: "pending", unresolved: ["backup.collector"] }, operations: { status: "pending", unresolved: ["operations.tls"] }, rollback: { status: "pending", unresolved: ["rollback.owner"] } });
      return "#!/bin/sh\n";
    },
    lstat: async () => ({ isFile: () => true, isSymbolicLink: () => false, size: 1 }),
    fixture,
  };
}

test("strict local delivery assertion remains exported", async () => {
  const { readFile } = await import("node:fs/promises");
  const receipt = JSON.parse(await readFile("ops/local-deliveries/509b75c23e0e0af22272493cc8df32280444057d.json", "utf8"));
  assert.equal(assertLocalDeliveryEvidenceSchema(receipt), true);
});

test("canonical blocked readiness binds local inputs and returns sanitized STOP", async () => {
  const options = baseOptions();
  const report = await collectProductionReadiness(options);
  assert.equal(report.decision, "STOP");
  assert.equal(report.productionEvidence.status, "BLOCKED");
  assert.equal(report.prerequisites.backupRestore.status, "PENDING");
  assert.equal(report.prerequisites.rollback.status, "PENDING");
  assert.equal(report.repository.branch, "refs/heads/dev");
  assert.match(report.localDelivery.receiptSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.localDelivery.implementationAncestor, true);
  assert.equal(report.deployArtifacts.changedSinceImplementation, false);
  assert.equal(report.deployArtifacts.files.length, 2);
  const output = formatProductionReadinessReport(report);
  assert.deepEqual(JSON.parse(output), report);
  assert.doesNotMatch(output, /hostile-secret|private\/|http|47\.99|124\.222/i);
});

test("local readiness fails closed without falling back to an older receipt", async () => {
  const options = baseOptions({ clean: false });
  const report = await collectProductionReadiness(options);
  assert.equal(report.decision, "STOP");
  assert.equal(report.repository.clean, false);
  assert.ok(report.reasons.includes("repository.dirty"));
  assert.doesNotMatch(JSON.stringify(report), /hostile-secret/);
});

test("expect-stop changes only the exit code for a valid STOP", async () => {
  const output = [];
  const result = await runProductionReadinessCli({ argv: ["--expect-stop"], output: { write: (line) => output.push(line) }, collect: async () => ({ format: "blog-x-production-rollout-readiness", version: 1, decision: "STOP", repository: { branch: "refs/heads/dev", branchMatched: true, head: sha("b"), clean: true }, localDelivery: { receipt: `ops/local-deliveries/${sha("a")}.json`, receiptSha256: "c".repeat(64), implementationRevision: sha("a"), implementationAncestor: true, targets: { api: "sha256:" + "a".repeat(64), web: "sha256:" + "b".repeat(64) } }, deployArtifacts: { files: [], manifestSha256: "d".repeat(64), changedSinceImplementation: false }, productionEvidence: { source: "canonical", sha256: "e".repeat(64), status: "BLOCKED", reasons: ["authorization.change_window"] }, prerequisites: { backupRestore: { status: "PENDING", unresolved: ["backup.collector"] }, rollback: { status: "PENDING", unresolved: ["rollback.owner"] } }, reasons: ["authorization.change_window"] }) });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(output.join("")), result.report);
});

test("validated external readiness can produce GO while unsafe bundles fail closed", async (context) => {
  const root = await readyBundle(context);
  const ready = await collectProductionReadiness({ ...baseOptions(), bundleRoot: root, evidencePath: "evidence.json", now: () => now });
  assert.equal(ready.decision, "GO", JSON.stringify(ready));
  assert.equal(ready.productionEvidence.status, "PRE_RELEASE_READY");
  assert.equal(ready.prerequisites.backupRestore.status, "READY");
  assert.equal(ready.prerequisites.rollback.status, "READY");
  const generated = await readyBundle(context, { scope: "generated-fake" });
  const blocked = await collectProductionReadiness({ ...baseOptions(), bundleRoot: generated, evidencePath: "evidence.json", now: () => now });
  assert.equal(blocked.decision, "STOP");
  assert.ok(blocked.reasons.includes("backupRestore.generated_scope"));
  const extra = await readyBundle(context, { extra: true });
  const invalid = await collectProductionReadiness({ ...baseOptions(), bundleRoot: extra, evidencePath: "evidence.json", now: () => now });
  assert.equal(invalid.decision, "STOP");
  assert.equal(invalid.__exitCode, 2);
  assert.doesNotMatch(JSON.stringify(invalid), /private\/|future-mount-profile|hostile-secret/);
});
