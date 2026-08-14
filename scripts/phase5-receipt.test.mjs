import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { auditMilestoneReceipt } from "./check-boundaries.mjs";
import { acquirePhase5ReceiptWriterLock, canonicalPhase5ResultBytes, hashPhase5Receipt, hashPhase5ResultRecord, phase5ExecutionResultSchema, phase5ReceiptSchema, releasePhase5ReceiptWriterLock, verifyPhase5Receipt, writePhase5ReceiptAtomic } from "./phase5-receipt.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const implementationRevision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim();
const command = ["corepack", "pnpm", "local:verify", "--", "--phase5-full", "--interruption-check", "--parallel-check"];

function receipt({ completedAt = "2026-08-10T14:30:00.000Z", mutate } = {}) {
  const suiteManifest = {
    format: "blog-x-phase5-suite-manifest",
    suites: [
      { id: "release", kind: "node", path: "scripts/release-gate.test.mjs", sourceSha256: "a".repeat(64) },
      { id: "pipeline", kind: "node", path: "scripts/backup/production.test.mjs", sourceSha256: "b".repeat(64) },
    ],
    version: 2,
  };
  const suites = suiteManifest.suites.map((suite) => {
    const counts = { tests: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
    const resultRecord = {
      format: "blog-x-phase5-execution-result", version: 1, suiteId: suite.id, kind: suite.kind, sourceSha256: suite.sourceSha256,
      invocations: [{ ordinal: 1, parser: suite.kind === "pipeline" ? "production-backup-result-v1" : "node-tap-v13", startedAt: "2026-08-10T14:00:00.000Z", completedAt: "2026-08-10T14:00:01.000Z", exitCode: 0, signal: null, redactedOutputBytes: 12, redactedOutputSha256: suite.id === "release" ? "e".repeat(64) : "f".repeat(64), counts }],
      counts, outcome: "pass",
    };
    return { id: suite.id, sourceSha256: suite.sourceSha256, resultRecord, resultSha256: hashPhase5ResultRecord(resultRecord) };
  });
  const value = {
    canonicalDecisionSha256: "c".repeat(64),
    canonicalDecisionState: "BLOCKED",
    canonicalEvidenceSha256: "d".repeat(64),
    command,
    completedAt,
    format: "blog-x-phase5-full-gate-receipt",
    implementationRevision,
    mode: "phase5-full",
    scope: "local-generated-production-pipeline-and-fake-fault-only",
    startedAt: "2026-08-10T14:00:00.000Z",
    suiteManifest,
    suiteManifestSha256: sha(canonicalPhase5ResultBytes(suiteManifest)),
    suites,
    version: 2,
  };
  mutate?.(value);
  return value;
}

async function receiptRoot(context) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-phase5-receipt-"));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  return { root, receiptPath: join(root, "receipt.json") };
}

function passedAudit(receiptSha256, completedAt) {
  return `---\nmilestone: v1.0\naudited: 2026-08-10T14:31:00Z\nstatus: passed\nfull_gate_receipt_version: 2\nfull_gate_receipt_path: ops/phase5-full-gate-receipt.json\nfull_gate_receipt_sha256: ${receiptSha256}\nimplementation_revision: ${implementationRevision}\n---\n\n# Audit\n\nReceipt completed at ${completedAt}.\n`;
}

async function writeWithLock(value, target, options = {}) {
  const processInspector = async (pid) => ({ alive: pid === process.pid, birthIdentity: "test-process-birth-identity" });
  const authority = await acquirePhase5ReceiptWriterLock({ receiptPath: target.receiptPath, processInspector });
  try {
    return await writePhase5ReceiptAtomic(value, {
      cleanWorktree: true, expectedRevision: implementationRevision, receiptPath: target.receiptPath,
      authority, expectedPredecessor: authority.expectedPredecessor, ...options,
    });
  } finally { await releasePhase5ReceiptWriterLock(authority); }
}

test("strict receipt schema rejects unknown or incomplete suites, digest errors, non-BLOCKED state, fake live language, and inverted time", () => {
  const cases = [
    (value) => { delete value.suites[0]; },
    (value) => { value.extra = true; },
    (value) => { value.suites[0].tests = 0; },
    (value) => { value.suites[0].skipped = 1; value.suites[0].passed = 1; },
    (value) => { value.suites[0].outcome = "fail"; },
    (value) => { value.suiteManifestSha256 = "0".repeat(64); },
    (value) => { value.implementationRevision = "dirty"; },
    (value) => { value.canonicalDecisionState = "PRE_RELEASE_READY"; },
    (value) => { value.scope = "https://live.example.invalid"; },
    (value) => { value.completedAt = "2026-08-10T13:00:00.000Z"; },
  ];
  for (const mutate of cases) assert.throws(() => phase5ReceiptSchema.parse(receipt({ mutate })), /receipt|suite|timestamp|invalid/i);
});

test("Phase 5 v2 canonical records hash safe actual invocation facts", () => {
  const record = {
    format: "blog-x-phase5-execution-result", version: 1, suiteId: "release", kind: "node", sourceSha256: "a".repeat(64),
    invocations: [{ ordinal: 1, parser: "node-tap-v13", startedAt: "2026-08-10T14:00:00.000Z", completedAt: "2026-08-10T14:00:01.000Z", exitCode: 0, signal: null, redactedOutputBytes: 41, redactedOutputSha256: "b".repeat(64), counts: { tests: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0 } }],
    counts: { tests: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0 }, outcome: "pass",
  };
  assert.equal(phase5ExecutionResultSchema.parse(record), record);
  const reordered = { ...record, counts: { ...record.counts }, invocations: record.invocations.map((item) => ({ ...item, counts: { ...item.counts } })) };
  assert.deepEqual(canonicalPhase5ResultBytes(record), canonicalPhase5ResultBytes(reordered));
  assert.equal(hashPhase5ResultRecord(record), hashPhase5ResultRecord(reordered));
  reordered.invocations[0].redactedOutputBytes += 1;
  assert.notEqual(hashPhase5ResultRecord(record), hashPhase5ResultRecord(reordered));
});

test("writer rejects dirty or non-HEAD implementation authority before it creates a receipt", async (context) => {
  const target = await receiptRoot(context);
  await assert.rejects(writePhase5ReceiptAtomic(receipt(), { cleanWorktree: false, expectedRevision: implementationRevision, receiptPath: target.receiptPath }), /clean/i);
  await assert.rejects(writePhase5ReceiptAtomic(receipt(), { cleanWorktree: true, expectedRevision: "0".repeat(40), receiptPath: target.receiptPath }), /revision/i);
  await assert.rejects(readFile(target.receiptPath), /ENOENT/);
});

test("atomic failure preserves an earlier verified receipt byte-for-byte", async (context) => {
  const target = await receiptRoot(context);
  await writeWithLock(receipt(), target);
  const before = await readFile(target.receiptPath);
  await assert.rejects(writeWithLock(receipt({ completedAt: "2026-08-10T14:40:00.000Z" }), target, {
    beforeRename: async () => { throw new Error("fault-before-rename"); },
  }), /fault-before-rename/);
  assert.deepEqual(await readFile(target.receiptPath), before);
});

test("success fsyncs, readback-validates, and exposes one stable receipt digest", async (context) => {
  const target = await receiptRoot(context);
  const written = await writeWithLock(receipt(), target);
  const verified = await verifyPhase5Receipt(target.receiptPath);
  assert.equal(written.sha256, verified.sha256);
  assert.equal(written.sha256, await hashPhase5Receipt(target.receiptPath));
  const cli = spawnSync(process.execPath, ["scripts/phase5-receipt.mjs", "verify", `--receipt=${target.receiptPath}`], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(cli.status, 0);
  assert.match(cli.stdout.trim(), /^[a-f0-9]{64}$/);
});

test("fixed writer lock permits one live owner and predecessor CAS preserves changed target bytes", async (context) => {
  const target = await receiptRoot(context);
  const processInspector = async (pid) => ({ alive: pid === process.pid, birthIdentity: "test-process-birth-identity" });
  const first = await acquirePhase5ReceiptWriterLock({ receiptPath: target.receiptPath, processInspector });
  await assert.rejects(acquirePhase5ReceiptWriterLock({ receiptPath: target.receiptPath, processInspector }), /live owner/i);
  await releasePhase5ReceiptWriterLock(first);
  await writeWithLock(receipt(), target);
  const authority = await acquirePhase5ReceiptWriterLock({ receiptPath: target.receiptPath, processInspector });
  const changed = Buffer.from('{"format":"external-test-change","version":1}\n');
  try {
    await assert.rejects(writePhase5ReceiptAtomic(receipt({ completedAt: "2026-08-10T14:40:00.000Z" }), {
      cleanWorktree: true, expectedRevision: implementationRevision, receiptPath: target.receiptPath,
      authority, expectedPredecessor: authority.expectedPredecessor,
      beforeRename: async () => { await writeFile(target.receiptPath, changed); },
    }), /predecessor changed/i);
    assert.deepEqual(await readFile(target.receiptPath), changed);
  } finally { await releasePhase5ReceiptWriterLock(authority); }
});

test("premature passed audit fails without an exact verified receipt while the clean fixture passes", async (context) => {
  const premature = JSON.parse(await readFile(join(process.cwd(), "scripts/fixtures/prohibitions/premature-phase5-audit.json"), "utf8"));
  const clean = JSON.parse(await readFile(join(process.cwd(), "scripts/fixtures/prohibitions/phase5-receipt-clean.json"), "utf8"));
  assert.equal(premature.id, "premature-phase5-audit");
  assert.equal(clean.id, "phase5-receipt-clean");
  const target = await receiptRoot(context);
  const missing = await auditMilestoneReceipt(target.root, passedAudit("0".repeat(64), "2026-08-10T14:30:00.000Z"), { isAncestor: async () => true });
  assert.equal(missing.some((finding) => finding.code === "phase5_audit_receipt_missing"), true);
  const written = await writeWithLock(receipt(), target);
  const cleanAudit = await auditMilestoneReceipt(target.root, passedAudit(written.sha256, "2026-08-10T14:30:00.000Z"), {
    isAncestor: async (revision) => revision === implementationRevision,
    receiptPath: target.receiptPath,
  });
  assert.deepEqual(cleanAudit, []);
});
