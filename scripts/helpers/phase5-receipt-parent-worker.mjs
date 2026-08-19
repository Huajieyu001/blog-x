import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  acquirePhase5ReceiptWriterLock,
  canonicalPhase5ResultBytes,
  hashPhase5ResultRecord,
  releasePhase5ReceiptWriterLock,
  writePhase5ReceiptAtomic,
} from "../phase5-receipt.mjs";

const execFileAsync = promisify(execFile);
const actions = new Set(["hold", "write"]);
const lifecycleEvents = new Set(["recovery-guard-acquired", "lock-created-before-readback", "lock-release-before-ownership-check"]);
const action = process.argv[2];
const receiptPath = resolve(process.argv[3] ?? "");
const observedEvent = process.argv[4] || null;
const generated = dirname(dirname(receiptPath)) === resolve(tmpdir())
  && /^blog-x-phase5-receipt-[A-Za-z0-9_-]{6,64}$/.test(basename(dirname(receiptPath)))
  && basename(receiptPath) === "receipt.json";
if (!process.send || !actions.has(action) || !generated || (observedEvent !== null && !lifecycleEvents.has(observedEvent))) {
  throw new Error("phase5 receipt worker input is invalid");
}

let pendingRelease = null;
let sequence = 0;
process.on("message", (message) => {
  if (!message || message.type !== "release" || typeof message.token !== "string" || !pendingRelease || message.token !== pendingRelease.token) {
    const error = new Error("phase5 receipt worker release is unknown or duplicated");
    pendingRelease?.reject(error);
    pendingRelease = null;
    process.send?.({ type: "protocol-error", message: error.message });
    return;
  }
  const { resolve: accept } = pendingRelease;
  pendingRelease = null;
  accept();
});

function waitForRelease(token) {
  if (pendingRelease) throw new Error("phase5 receipt worker already has a pending barrier");
  return new Promise((accept, reject) => { pendingRelease = { token, resolve: accept, reject }; });
}

async function observe(name, metadata) {
  if (name !== observedEvent) return undefined;
  if (!Object.isFrozen(metadata)) throw new Error("phase5 receipt lifecycle metadata is not frozen");
  const token = `${name}-${++sequence}`;
  const barrier = waitForRelease(token);
  process.send({ type: "event", name, token });
  await barrier;
  return undefined;
}

function sha(value) { return createHash("sha256").update(value).digest("hex"); }

async function createReceipt(implementationRevision) {
  const suiteManifest = { format: "blog-x-phase5-suite-manifest", version: 2, suites: [{
    id: "worker", kind: "node", path: "scripts/phase5-receipt-concurrency.test.mjs", sourceSha256: "a".repeat(64),
  }] };
  const counts = { tests: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
  const resultRecord = {
    format: "blog-x-phase5-execution-result", version: 1, suiteId: "worker", kind: "node", sourceSha256: "a".repeat(64),
    invocations: [{ ordinal: 1, parser: "node-tap-v13", startedAt: "2026-08-14T12:00:00.000Z", completedAt: "2026-08-14T12:00:01.000Z", exitCode: 0, signal: null, redactedOutputBytes: 16, redactedOutputSha256: "b".repeat(64), counts }],
    counts, outcome: "pass",
  };
  return {
    canonicalDecisionSha256: "c".repeat(64), canonicalDecisionState: "BLOCKED", canonicalEvidenceSha256: "d".repeat(64),
    command: ["corepack", "pnpm", "local:verify", "--", "--phase5-full", "--interruption-check", "--parallel-check"],
    completedAt: "2026-08-14T12:00:02.000Z", format: "blog-x-phase5-full-gate-receipt", implementationRevision,
    mode: "phase5-full", scope: "local-generated-production-pipeline-and-fake-fault-only", startedAt: "2026-08-14T12:00:00.000Z",
    suiteManifest, suiteManifestSha256: sha(canonicalPhase5ResultBytes(suiteManifest)),
    suites: [{ id: "worker", sourceSha256: "a".repeat(64), resultRecord, resultSha256: hashPhase5ResultRecord(resultRecord) }], version: 2,
  };
}

async function main() {
  const startBarrier = waitForRelease("start");
  process.send({ type: "ready" });
  await startBarrier;
  const authority = await acquirePhase5ReceiptWriterLock({ receiptPath, testLifecycleObserver: observe });
  const actionBarrier = waitForRelease("action");
  process.send({ type: "acquired", pid: process.pid });
  await actionBarrier;
  try {
    if (action === "write") {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: process.cwd() });
      const implementationRevision = stdout.trim();
      await writePhase5ReceiptAtomic(await createReceipt(implementationRevision), {
        cleanWorktree: true, expectedRevision: implementationRevision, receiptPath,
        authority, expectedPredecessor: authority.expectedPredecessor,
      });
    }
  } finally {
    await releasePhase5ReceiptWriterLock(authority);
  }
  process.send({ type: "done", receiptBytes: await readFile(receiptPath).then((bytes) => bytes.length).catch(() => 0) }, () => process.disconnect());
}

main().catch((error) => {
  process.send?.({ type: "error", message: error instanceof Error ? error.message : String(error) }, () => process.disconnect());
  process.exitCode = 1;
});
