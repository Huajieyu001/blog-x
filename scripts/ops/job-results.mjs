import { lstat, open, rename, unlink } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";

const receiptFormat = "blog-x-job-receipt";
const receiptVersion = 1;
const jobs = new Set(["retention", "publish-due"]);
const statusCodes = new Set(["ok", "command_failed", "timeout", "signaled", "invalid_output", "spawn_failed"]);
const timestamp = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));

function isCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((count) => Number.isSafeInteger(count) && count >= 0);
}

/** Reject paths that could let a job receipt escape its dedicated owner-only directory. */
export async function assertSafeResultRoot(resultRoot) {
  if (typeof resultRoot !== "string" || !isAbsolute(resultRoot) || basename(resultRoot) === "." || basename(resultRoot) === "..") throw new Error("unsafe result root");
  const stat = await lstat(resultRoot).catch(() => null);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error("unsafe result root");
}

export function validateJobReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  const keys = Object.keys(receipt).sort();
  const expected = ["code", "completedAt", "counts", "format", "job", "observedAt", "runId", "status", "version"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  return receipt.format === receiptFormat
    && receipt.version === receiptVersion
    && jobs.has(receipt.job)
    && typeof receipt.runId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.runId)
    && timestamp(receipt.observedAt) && timestamp(receipt.completedAt)
    && (receipt.status === "succeeded" || receipt.status === "failed")
    && statusCodes.has(receipt.code)
    && ((receipt.status === "succeeded" && receipt.code === "ok") || (receipt.status === "failed" && receipt.code !== "ok"))
    && isCounts(receipt.counts);
}

/** Atomically publishes one immutable, aggregate-only terminal receipt. */
export async function writeJobReceipt(resultRoot, receipt, { createRunId = randomUUID } = {}) {
  await assertSafeResultRoot(resultRoot);
  if (!validateJobReceipt(receipt)) throw new Error("invalid job receipt");
  const filename = `receipt-${receipt.job}-${receipt.runId}.json`;
  const target = join(resultRoot, filename);
  if (await lstat(target).then(() => true).catch(() => false)) throw new Error("receipt target already exists");
  const temporary = join(resultRoot, `.${filename}.${createRunId()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(receipt)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    // The collision check happens before a same-filesystem atomic rename. Run IDs
    // are UUIDs and the dedicated directory has one owner, so an unexpected file
    // at this target is treated as a failed run rather than replacing evidence.
    if (await lstat(target).then(() => true).catch(() => false)) throw new Error("receipt target already exists");
    await rename(temporary, target);
    const directory = await open(resultRoot, "r");
    try { await directory.sync(); } finally { await directory.close(); }
    return target;
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}
