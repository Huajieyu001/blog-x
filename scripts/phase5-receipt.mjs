import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, open, readFile, rename, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixedReceiptPath = resolve(repositoryRoot, "ops/phase5-full-gate-receipt.json");
const legacyReceiptSha256 = "aeb00503c90e3a7476be010915b7b5ea04ae5ea7a430e582e728ab92dcb0b0c9";
const digestPattern = /^[a-f0-9]{64}$/;
const revisionPattern = /^[a-f0-9]{40}$/;
const requiredCommand = Object.freeze(["corepack", "pnpm", "local:verify", "--", "--phase5-full", "--interruption-check", "--parallel-check"]);
const requiredScope = "local-generated-production-pipeline-and-fake-fault-only";
const lockAuthorities = new WeakSet();
const lifecycleEventNames = new Set([
  "recovery-guard-acquired",
  "lock-created-before-readback",
  "lock-release-before-ownership-check",
]);

function fail(message) { throw new Error(`phase5 receipt ${message}`); }

function strictObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) fail(`${label} is invalid`);
  return value;
}

function isIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && /[zZ]|[+-]\d\d:\d\d$/.test(value);
}

function hashBytes(value) { return createHash("sha256").update(value).digest("hex"); }

function countKeys(value) { return ["tests", "passed", "failed", "cancelled", "skipped", "todo"]; }

function parseCounts(value, label = "counts") {
  strictObject(value, countKeys(), label);
  for (const key of countKeys(value)) if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail(`${label} is invalid`);
  if (value.tests !== value.passed + value.failed + value.cancelled + value.skipped + value.todo) fail(`${label} arithmetic is invalid`);
  return value;
}

function addCounts(values) {
  return values.reduce((total, value) => {
    for (const key of countKeys(value)) total[key] += value[key];
    return total;
  }, { tests: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
}

function parserForKind(kind) {
  return ({ node: "node-tap-v13", database: "node-tap-v13", browser: "playwright-line-v1", pipeline: "production-backup-result-v1", boundary: "repository-boundary-result-v1" })[kind];
}

function canonicalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("canonical record contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") fail("canonical record contains an unsupported value");
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key]);
  return output;
}

export function canonicalPhase5ResultBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalize(value))}\n`, "utf8");
}

export function hashPhase5ResultRecord(value) {
  return hashBytes(canonicalPhase5ResultBytes(value));
}

function scalarScan(value) {
  const scalars = [];
  const visit = (item) => {
    if (typeof item === "string") scalars.push(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") Object.values(item).forEach(visit);
  };
  visit(value);
  for (const scalar of scalars) {
    if (/-----BEGIN|(?:password|passwd|cookie|token|secret)\s*[=:]|postgres(?:ql)?:\/\/[^\s/]+:[^\s@]+@/i.test(scalar)) fail("contains sensitive material");
    if (/\bhttps?:\/\/|\b(?:\d{1,3}\.){3}\d{1,3}\b/i.test(scalar)) fail("contains address authority");
    if (/\b(?:production|live)\s+(?:success|passed|ready|verified)\b/i.test(scalar)) fail("contains false live claim");
  }
}

function parseManifest(value) {
  strictObject(value, ["format", "suites", "version"], "suite manifest");
  if (value.format !== "blog-x-phase5-suite-manifest" || value.version !== 2 || !Array.isArray(value.suites) || !value.suites.length) fail("suite manifest is invalid");
  const ids = new Set();
  for (const suite of value.suites) {
    strictObject(suite, ["id", "kind", "path", "sourceSha256"], "suite manifest entry");
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(suite.id) || !parserForKind(suite.kind)
      || !/^(?:apps|scripts)\/[a-zA-Z0-9_./-]+\.(?:mjs|ts|tsx)$/.test(suite.path) || suite.path.includes("..")
      || !digestPattern.test(suite.sourceSha256) || ids.has(suite.id)) fail("suite manifest is invalid");
    ids.add(suite.id);
  }
  return value;
}

function parseInvocation(value, suite) {
  strictObject(value, ["completedAt", "counts", "exitCode", "ordinal", "parser", "redactedOutputBytes", "redactedOutputSha256", "signal", "startedAt"], "result invocation");
  if (!Number.isSafeInteger(value.ordinal) || value.ordinal < 1 || value.parser !== parserForKind(suite.kind)
    || !isIso(value.startedAt) || !isIso(value.completedAt) || Date.parse(value.startedAt) > Date.parse(value.completedAt)
    || value.exitCode !== 0 || value.signal !== null || !Number.isSafeInteger(value.redactedOutputBytes) || value.redactedOutputBytes <= 0
    || !digestPattern.test(value.redactedOutputSha256)) fail("result invocation is invalid");
  const counts = parseCounts(value.counts, "invocation counts");
  if (counts.tests <= 0 || counts.passed <= 0 || counts.failed || counts.cancelled || counts.skipped || counts.todo) fail("result invocation is not a complete pass");
  return value;
}

export const phase5ExecutionResultSchema = {
  parse(value) {
    strictObject(value, ["counts", "format", "invocations", "kind", "outcome", "sourceSha256", "suiteId", "version"], "execution result");
    if (value.format !== "blog-x-phase5-execution-result" || value.version !== 1 || !/^[a-z][a-z0-9-]{1,63}$/.test(value.suiteId)
      || !parserForKind(value.kind) || !digestPattern.test(value.sourceSha256) || !Array.isArray(value.invocations) || !value.invocations.length || value.outcome !== "pass") fail("execution result is invalid");
    const suite = { id: value.suiteId, kind: value.kind };
    const ordinals = new Set();
    for (const invocation of value.invocations) {
      parseInvocation(invocation, suite);
      if (ordinals.has(invocation.ordinal)) fail("execution result has duplicate invocation ordinal");
      ordinals.add(invocation.ordinal);
    }
    if (!value.invocations.every((item, index) => item.ordinal === index + 1)) fail("execution result invocation order is invalid");
    const actual = addCounts(value.invocations.map((item) => item.counts));
    const counts = parseCounts(value.counts, "result counts");
    if (JSON.stringify(actual) !== JSON.stringify(counts) || counts.tests <= 0 || counts.passed !== counts.tests || counts.failed || counts.cancelled || counts.skipped || counts.todo) fail("execution result aggregate is invalid");
    scalarScan(value);
    return value;
  },
};

function parseSuiteResults(value, manifest) {
  if (!Array.isArray(value) || value.length !== manifest.suites.length) fail("suite results are incomplete");
  const manifestById = new Map(manifest.suites.map((suite) => [suite.id, suite]));
  const ids = new Set();
  for (const suite of value) {
    strictObject(suite, ["id", "resultRecord", "resultSha256", "sourceSha256"], "suite result");
    const expected = manifestById.get(suite.id);
    if (!expected || ids.has(suite.id) || suite.sourceSha256 !== expected.sourceSha256 || !digestPattern.test(suite.resultSha256)) fail("suite result is invalid");
    const record = phase5ExecutionResultSchema.parse(suite.resultRecord);
    if (record.suiteId !== expected.id || record.kind !== expected.kind || record.sourceSha256 !== expected.sourceSha256
      || hashPhase5ResultRecord(record) !== suite.resultSha256) fail("suite result digest is invalid");
    ids.add(suite.id);
  }
  return value;
}

export const phase5ReceiptSchema = {
  parse(value) {
    strictObject(value, ["canonicalDecisionSha256", "canonicalDecisionState", "canonicalEvidenceSha256", "command", "completedAt", "format", "implementationRevision", "mode", "scope", "startedAt", "suiteManifest", "suiteManifestSha256", "suites", "version"], "receipt");
    if (value.format !== "blog-x-phase5-full-gate-receipt" || value.version !== 2 || !revisionPattern.test(value.implementationRevision)
      || JSON.stringify(value.command) !== JSON.stringify(requiredCommand) || value.mode !== "phase5-full" || value.scope !== requiredScope
      || !isIso(value.startedAt) || !isIso(value.completedAt) || Date.parse(value.startedAt) > Date.parse(value.completedAt)
      || !digestPattern.test(value.suiteManifestSha256) || !digestPattern.test(value.canonicalEvidenceSha256)
      || !digestPattern.test(value.canonicalDecisionSha256) || value.canonicalDecisionState !== "BLOCKED") fail("schema is invalid");
    const manifest = parseManifest(value.suiteManifest);
    if (hashBytes(canonicalPhase5ResultBytes(manifest)) !== value.suiteManifestSha256) fail("suite manifest digest is invalid");
    parseSuiteResults(value.suites, manifest);
    scalarScan(value);
    return value;
  },
};

function validateReceiptPath(value) {
  if (typeof value !== "string" || !value || value.includes("${") || value.includes("..")) fail("path is invalid");
  const target = resolve(value);
  const generated = dirname(dirname(target)) === resolve(tmpdir())
    && /^blog-x-phase5-receipt-[A-Za-z0-9_-]{6,64}$/.test(basename(dirname(target))) && basename(target) === "receipt.json";
  if (target !== fixedReceiptPath && !generated) fail("path is not an exact receipt target");
  return target;
}

function lifecycleObserverFor(target, value) {
  if (value === undefined) return null;
  if (typeof value !== "function") fail("test lifecycle observer is invalid");
  if (target === fixedReceiptPath) fail("test lifecycle observer requires a generated receipt target");
  return value;
}

async function observeLifecycle(observer, name, metadata) {
  if (!observer) return;
  if (!lifecycleEventNames.has(name)) fail("test lifecycle observer event is invalid");
  const frozen = Object.freeze({ ...metadata, name });
  let result;
  try { result = observer(name, frozen); } catch { fail("test lifecycle observer threw"); }
  try { result = await result; } catch { fail("test lifecycle observer rejected"); }
  if (result !== undefined) fail("test lifecycle observer must resolve undefined");
}

async function assertSafeParent(target) {
  const parent = dirname(target);
  const info = await lstat(parent).catch(() => fail("parent is missing"));
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o022) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid())) fail("parent is unsafe");
  return parent;
}

async function readReceiptBytes(receiptPath) {
  const target = validateReceiptPath(receiptPath);
  const info = await lstat(target).catch(() => fail("is missing"));
  if (!info.isFile() || info.isSymbolicLink()) fail("is not a regular file");
  return readFile(target);
}

async function syncPath(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

function parseLegacyV1(value, bytes, target) {
  if (target !== fixedReceiptPath || hashBytes(bytes) !== legacyReceiptSha256 || value?.format !== "blog-x-phase5-full-gate-receipt" || value?.version !== 1) fail("legacy receipt is not the exact historical artifact");
  return value;
}

export async function hashPhase5Receipt(receiptPath = fixedReceiptPath) { return hashBytes(await readReceiptBytes(receiptPath)); }

export async function verifyPhase5Receipt(receiptPath = fixedReceiptPath) {
  const target = validateReceiptPath(receiptPath);
  const bytes = await readReceiptBytes(target);
  const value = JSON.parse(bytes.toString("utf8"));
  const receipt = value?.version === 1 ? parseLegacyV1(value, bytes, target) : phase5ReceiptSchema.parse(value);
  return { path: target, receipt, sha256: hashBytes(bytes), legacy: value?.version === 1 };
}

function lockRecord(value) {
  strictObject(value, ["acquiredAt", "format", "ownerBirthIdentity", "ownerNonce", "ownerPid", "version"], "writer lock");
  if (value.format !== "blog-x-phase5-receipt-writer-lock" || value.version !== 1 || !Number.isSafeInteger(value.ownerPid) || value.ownerPid <= 0
    || typeof value.ownerBirthIdentity !== "string" || !value.ownerBirthIdentity.trim() || !/^[a-f0-9]{32,128}$/.test(value.ownerNonce) || !isIso(value.acquiredAt)) fail("writer lock is invalid");
  scalarScan(value);
  return value;
}

async function defaultProcessInspector(pid) {
  try { process.kill(pid, 0); } catch { return { alive: false, birthIdentity: null }; }
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8" });
    const birthIdentity = stdout.trim().replace(/\s+/g, " ");
    return { alive: Boolean(birthIdentity), birthIdentity: birthIdentity || null };
  } catch { return { alive: false, birthIdentity: null }; }
}

async function assertSafeLockPath(path) {
  const info = await lstat(path).catch(() => fail("writer lock is missing"));
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid())) fail("writer lock is unsafe");
  return info;
}

async function readLock(path) {
  await assertSafeLockPath(path);
  try { return lockRecord(JSON.parse((await readFile(path, "utf8")))); } catch (error) { if (error instanceof Error && error.message.startsWith("phase5 receipt")) throw error; fail("writer lock is unreadable"); }
}

async function safelyUnlinkHeldLock(lock, changedMessage) {
  try {
    const current = await assertSafeLockPath(lock.path);
    const record = await readLock(lock.path);
    if (current.dev !== lock.dev || current.ino !== lock.ino || record.ownerNonce !== lock.record.ownerNonce) fail(changedMessage);
    await unlink(lock.path);
    await lstat(lock.path).then(() => fail("writer lock was not removed")).catch((error) => { if (error?.code !== "ENOENT") throw error; });
  } finally { await lock.handle.close().catch(() => undefined); }
}

async function createLock(path, inspector, observer, role) {
  const record = {
    format: "blog-x-phase5-receipt-writer-lock", version: 1, ownerPid: process.pid,
    ownerBirthIdentity: (await inspector(process.pid)).birthIdentity, ownerNonce: randomBytes(24).toString("hex"), acquiredAt: new Date().toISOString(),
  };
  if (!record.ownerBirthIdentity) fail("writer lock owner birth identity is unavailable");
  const handle = await open(path, "wx", 0o600);
  let held;
  try {
    const created = await handle.stat();
    held = { path, handle, dev: created.dev, ino: created.ino, record };
    await handle.writeFile(JSON.stringify(record));
    await handle.sync();
    const info = await handle.stat();
    if (!info.isFile() || (info.mode & 0o077) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid())) fail("writer lock is unsafe");
    await observeLifecycle(observer, "lock-created-before-readback", { role, dev: String(info.dev), ino: String(info.ino), ownerNonce: record.ownerNonce });
    const byPath = await assertSafeLockPath(path);
    const readback = await readLock(path);
    if (byPath.dev !== info.dev || byPath.ino !== info.ino || readback.ownerNonce !== record.ownerNonce) fail("writer lock readback differs");
    return { path, handle, dev: info.dev, ino: info.ino, record };
  } catch (error) {
    if (held) {
      try { await safelyUnlinkHeldLock(held, "writer lock ownership changed during create cleanup"); } catch (cleanupError) { throw cleanupError; }
    } else {
      await handle.close().catch(() => undefined);
    }
    throw error;
  }
}

async function lockIsLive(record, inspector) {
  const observed = await inspector(record.ownerPid);
  return observed?.alive === true && observed.birthIdentity === record.ownerBirthIdentity;
}

async function removeDeadLock(path, inspector) {
  const handle = await open(path, "r").catch(() => null);
  if (!handle) return false;
  try {
    const held = await handle.stat();
    const record = await readLock(path);
    if (await lockIsLive(record, inspector)) fail("writer lock has a live owner");
    const current = await assertSafeLockPath(path);
    const currentRecord = await readLock(path);
    if (current.dev !== held.dev || current.ino !== held.ino || currentRecord.ownerNonce !== record.ownerNonce) fail("writer lock changed during stale recovery");
    if (await lockIsLive(currentRecord, inspector)) fail("writer lock became live during stale recovery");
    await unlink(path);
    await lstat(path).then(() => fail("writer lock was not removed")).catch((error) => { if (error?.code !== "ENOENT") throw error; });
    return true;
  } finally { await handle.close().catch(() => undefined); }
}

async function releaseRawLock(lock, observer, role) {
  try {
    await observeLifecycle(observer, "lock-release-before-ownership-check", { role, dev: String(lock.dev), ino: String(lock.ino), ownerNonce: lock.record.ownerNonce });
  } catch (error) {
    try { await safelyUnlinkHeldLock(lock, "writer lock ownership changed during observer cleanup"); } catch (cleanupError) { throw cleanupError; }
    throw error;
  }
  await safelyUnlinkHeldLock(lock, "writer lock ownership changed before release");
}

async function readPredecessor(target) {
  const exists = await lstat(target).then((info) => {
    if (!info.isFile() || info.isSymbolicLink()) fail("receipt predecessor is unsafe");
    return true;
  }).catch((error) => { if (error?.code === "ENOENT") return false; throw error; });
  if (!exists) return { exists: false, version: null, sha256: null };
  const bytes = await readFile(target);
  let version;
  try { version = JSON.parse(bytes.toString("utf8")).version; } catch { fail("receipt predecessor is unreadable"); }
  if (!Number.isSafeInteger(version)) fail("receipt predecessor is invalid");
  return { exists: true, version, sha256: hashBytes(bytes) };
}

function samePredecessor(left, right) { return Boolean(left && right) && left.exists === right.exists && left.version === right.version && left.sha256 === right.sha256; }

export async function acquirePhase5ReceiptWriterLock(options = {}) {
  const target = validateReceiptPath(options.receiptPath ?? fixedReceiptPath);
  const observer = lifecycleObserverFor(target, options.testLifecycleObserver);
  await assertSafeParent(target);
  const writerPath = `${target}.lock`;
  const recoveryPath = `${writerPath}.recovery`;
  const inspector = options.processInspector ?? defaultProcessInspector;
  const createWriter = async () => {
    const raw = await createLock(writerPath, inspector, observer, "writer");
    if (await lstat(recoveryPath).then(() => true).catch((error) => error?.code === "ENOENT" ? false : Promise.reject(error))) {
      await releaseRawLock(raw, observer, "writer");
      fail("writer lock recovery is in progress");
    }
    const expectedPredecessor = await readPredecessor(target);
    const authority = { receiptPath: target, lockPath: writerPath, raw, expectedPredecessor, observer };
    lockAuthorities.add(authority);
    return authority;
  };
  try { return await createWriter(); } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  let guard;
  try { guard = await createLock(recoveryPath, inspector, observer, "recovery"); } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await readLock(recoveryPath);
    if (await lockIsLive(existing, inspector)) fail("writer lock recovery has a live owner");
    await removeDeadLock(recoveryPath, inspector);
    guard = await createLock(recoveryPath, inspector, observer, "recovery");
  }
  try {
    await observeLifecycle(observer, "recovery-guard-acquired", { role: "recovery", dev: String(guard.dev), ino: String(guard.ino), ownerNonce: guard.record.ownerNonce });
    const existing = await lstat(writerPath).then(() => true).catch((error) => error?.code === "ENOENT" ? false : Promise.reject(error));
    if (existing) {
      const record = await readLock(writerPath);
      if (await lockIsLive(record, inspector)) fail("writer lock has a live owner");
      await removeDeadLock(writerPath, inspector);
    }
    const raw = await createLock(writerPath, inspector, observer, "writer");
    const expectedPredecessor = await readPredecessor(target);
    const authority = { receiptPath: target, lockPath: writerPath, raw, expectedPredecessor, observer };
    lockAuthorities.add(authority);
    return authority;
  } finally { await releaseRawLock(guard, observer, "recovery"); }
}

export async function releasePhase5ReceiptWriterLock(authority) {
  if (!authority || !lockAuthorities.has(authority)) fail("writer lock authority is invalid");
  lockAuthorities.delete(authority);
  await releaseRawLock(authority.raw, authority.observer, "writer");
}

async function assertAuthority(authority, target, expectedPredecessor) {
  if (!authority || !lockAuthorities.has(authority) || authority.receiptPath !== target || !samePredecessor(authority.expectedPredecessor, expectedPredecessor)) fail("writer lock authority is invalid");
  const current = await assertSafeLockPath(authority.lockPath);
  const record = await readLock(authority.lockPath);
  if (current.dev !== authority.raw.dev || current.ino !== authority.raw.ino || record.ownerNonce !== authority.raw.record.ownerNonce) fail("writer lock authority was lost");
}

export async function writePhase5ReceiptAtomic(value, options = {}) {
  const receipt = phase5ReceiptSchema.parse(JSON.parse(JSON.stringify(value)));
  if (options.cleanWorktree !== true) fail("requires a clean committed implementation");
  if (!revisionPattern.test(options.expectedRevision ?? "") || options.expectedRevision !== receipt.implementationRevision) fail("revision does not match committed HEAD");
  const target = validateReceiptPath(options.receiptPath ?? fixedReceiptPath);
  await assertSafeParent(target);
  const expectedPredecessor = options.expectedPredecessor;
  await assertAuthority(options.authority, target, expectedPredecessor);
  const parent = dirname(target);
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
  const temporary = resolve(parent, `.${basename(target)}.incomplete-${randomBytes(12).toString("hex")}`);
  try {
    await open(temporary, "wx", 0o600).then(async (handle) => { try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } });
    await options.beforeRename?.(temporary);
    phase5ReceiptSchema.parse(JSON.parse((await readFile(temporary)).toString("utf8")));
    await assertAuthority(options.authority, target, expectedPredecessor);
    if (!samePredecessor(await readPredecessor(target), expectedPredecessor)) fail("receipt predecessor changed before rename");
    await rename(temporary, target);
    await syncPath(parent);
    await assertAuthority(options.authority, target, expectedPredecessor);
    const verified = await verifyPhase5Receipt(target);
    const actual = await readReceiptBytes(target);
    if (!actual.equals(bytes)) fail("readback bytes differ");
    return verified;
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const commandName = process.argv[2];
  if (commandName !== "verify") {
    process.stderr.write("PHASE5 RECEIPT INVALID command\n");
    process.exitCode = 2;
  } else {
    verifyPhase5Receipt(option("receipt") ?? fixedReceiptPath).then((result) => process.stdout.write(`${result.sha256}\n`)).catch(() => {
      process.stderr.write("PHASE5 RECEIPT INVALID\n");
      process.exitCode = 2;
    });
  }
}
