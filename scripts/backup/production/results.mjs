import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, open, readdir, rename, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

const digestPattern = /^[a-f0-9]{64}$/;
const setPattern = /^\d{8}T\d{6}Z-[a-z0-9]{8,32}$/;
const runPattern = /^[a-z0-9][a-z0-9-]{7,80}$/;
const failureStages = new Set(["collection", "encryption", "transfer", "receipt", "retention", "result", "recovery"]);
const failureCodes = new Set(["COLLECTION_FAILED", "ENCRYPTION_FAILED", "TRANSFER_FAILED", "RECEIPT_INVALID", "RETENTION_FAILED", "RESULT_FAILED", "RECOVERY_FAILED"]);

function fail(message) {
  throw new Error(`production result ${message}`);
}

function strictObject(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function parseAuthority(value, prefix) {
  if (!strictObject(value, ["kind", "root"]) || (value.kind !== "generated-test" && value.kind !== "service") || typeof value.root !== "string" || value.root.includes("${") || value.root.includes("..")) fail("authority is invalid");
  const root = resolve(value.root);
  if (value.kind === "generated-test") {
    if (dirname(root) !== resolve(tmpdir()) || !new RegExp(`^${prefix}-[A-Za-z0-9_-]{6,64}$`).test(basename(root))) fail("generated authority is invalid");
  } else if (root === "/" || root === resolve(tmpdir()) || root.startsWith(`${resolve(tmpdir())}/`) || root === resolve(process.cwd()) || root.startsWith(`${resolve(process.cwd())}/`)) {
    fail("service authority is invalid");
  }
  return { kind: value.kind, root };
}

async function restrictiveRoot(authority) {
  let info;
  try { info = await lstat(authority.root); } catch { fail("authority root is missing"); }
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail("authority root is unsafe");
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) fail("authority ownership is invalid");
  return authority;
}

export async function validateResultAuthority(value) {
  return restrictiveRoot(parseAuthority(value, "blog-x-production-result"));
}

export async function validateAlertAuthority(value) {
  return restrictiveRoot(parseAuthority(value, "blog-x-production-alert"));
}

export const productionBackupResultSchema = {
  parse(value) {
    if (!strictObject(value, ["alertOutcome", "ciphertextSha256", "createdAt", "destinationProfileId", "format", "manifestSha256", "receiptSha256", "retention", "scope", "setId", "status", "version"])) fail("schema is invalid");
    if (value.format !== "blog-x-production-backup-result" || value.version !== 1 || value.status !== "complete" || !setPattern.test(value.setId ?? "")
      || !["recorded", "unconfirmed"].includes(value.alertOutcome) || !["generated-production-pipeline", "generated-mounted-fixture", "generated-fake", "service-production-pipeline", "service-mounted-directory"].includes(value.scope)
      || typeof value.destinationProfileId !== "string" || !/^[a-z0-9-]{3,80}$/.test(value.destinationProfileId) || !Number.isFinite(Date.parse(value.createdAt))
      || [value.ciphertextSha256, value.manifestSha256, value.receiptSha256].some((item) => !digestPattern.test(item ?? "")) || !value.retention || !Number.isSafeInteger(value.retention.kept) || !Array.isArray(value.retention.deletedSetIds)) fail("schema is invalid");
    const serialized = JSON.stringify(value);
    if (/postgres(?:ql)?:\/\/|-----BEGIN|\b(?:password|cookie|token)\b|\bhttps?:\/\//i.test(serialized)) fail("contains sensitive authority");
    return value;
  },
};

export function redactProductionBackupResult(value) {
  return productionBackupResultSchema.parse(JSON.parse(JSON.stringify(value)));
}

export const productionBackupFailureSchema = {
  parse(value) {
    if (!strictObject(value, ["code", "format", "observedAt", "runId", "scope", "stage", "status", "version"])) fail("failure schema is invalid");
    if (value.format !== "blog-x-production-backup-attempt" || value.version !== 1 || value.status !== "failed"
      || !runPattern.test(value.runId ?? "") || !Number.isFinite(Date.parse(value.observedAt))
      || !failureStages.has(value.stage) || !failureCodes.has(value.code)
      || !["generated-production-pipeline", "service-production-pipeline"].includes(value.scope)) fail("failure schema is invalid");
    const serialized = JSON.stringify(value);
    if (/postgres(?:ql)?:\/\/|-----BEGIN|\b(?:password|cookie|token)\b|\bhttps?:\/\//i.test(serialized)) fail("failure contains sensitive authority");
    return value;
  },
};

export function redactProductionBackupFailure(value) {
  return productionBackupFailureSchema.parse(JSON.parse(JSON.stringify(value)));
}

export function parseProductionReleaseEvidence(value) {
  const parsed = productionBackupResultSchema.parse(value);
  if (parsed.scope !== "service-production-pipeline" || parsed.alertOutcome !== "recorded") fail("generated or unconfirmed evidence is not live production evidence");
  return parsed;
}

async function fsync(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function appendAtomic(root, filename, value) {
  const finalPath = resolve(root, filename);
  if (dirname(finalPath) !== root) fail("record target is invalid");
  const temporary = resolve(root, `.${filename}.incomplete-${randomBytes(12).toString("hex")}`);
  await lstat(finalPath).then(() => fail("record collision exists")).catch((error) => { if (error?.code !== "ENOENT") throw error; });
  await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  await fsync(temporary);
  await rename(temporary, finalPath);
  return finalPath;
}

export async function recordProductionResult(authority, value) {
  const root = await validateResultAuthority(authority);
  const result = redactProductionBackupResult(value);
  await appendAtomic(root.root, `result-${result.setId}.json`, result);
  return result;
}

export async function recordProductionFailure(authority, value) {
  const root = await validateResultAuthority(authority);
  const failure = redactProductionBackupFailure(value);
  await appendAtomic(root.root, `attempt-${failure.runId}.json`, failure);
  return failure;
}

export async function recordAlertOutcome(authority, value) {
  const root = await validateAlertAuthority(authority);
  if (!value || !setPattern.test(value.setId ?? "") || !["recorded", "unconfirmed"].includes(value.status) || !Number.isFinite(Date.parse(value.createdAt))) fail("alert outcome is invalid");
  const outcome = { format: "blog-x-production-alert-outcome", version: 1, setId: value.setId, status: value.status, createdAt: value.createdAt };
  await appendAtomic(root.root, `alert-${value.setId}.json`, outcome);
  return outcome;
}

/** Bounded, non-link reader for redacted production terminal evidence. */
export async function readLatestProductionBackupEvidence(root, { now = new Date(), freshnessHours = 30, list = readdir, read = readFile, stat = lstat } = {}) {
  try {
    const entries = await list(root, { withFileTypes: true });
    if (entries.length > 512) return { status: "malformed" };
    const terminal = [];
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !/^(result|attempt)-[a-z0-9][a-z0-9-]{7,80}\.json$/i.test(entry.name)) continue;
      const path = resolve(root, entry.name);
      const info = await stat(path);
      if (!info.isFile() || info.isSymbolicLink()) return { status: "malformed" };
      const value = JSON.parse(await read(path, "utf8"));
      if (entry.name.startsWith("result-")) {
        productionBackupResultSchema.parse(value);
        terminal.push({ status: "succeeded", at: Date.parse(value.createdAt), id: value.setId });
      } else {
        productionBackupFailureSchema.parse(value);
        terminal.push({ status: "failed", at: Date.parse(value.observedAt), id: value.runId });
      }
    }
    if (!terminal.length) return { status: "missing" };
    terminal.sort((left, right) => right.at - left.at || right.id.localeCompare(left.id));
    const newest = terminal[0];
    if (newest.status !== "succeeded") return { status: "failed" };
    if (newest.at > now.getTime() || now.getTime() - newest.at > freshnessHours * 60 * 60 * 1000) return { status: "stale" };
    return { status: "current" };
  } catch { return { status: "malformed" }; }
}
