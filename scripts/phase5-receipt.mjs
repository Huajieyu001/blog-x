import { createHash, randomBytes } from "node:crypto";
import { lstat, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixedReceiptPath = resolve(repositoryRoot, "ops/phase5-full-gate-receipt.json");
const digestPattern = /^[a-f0-9]{64}$/;
const revisionPattern = /^[a-f0-9]{40}$/;
const requiredCommand = Object.freeze(["corepack", "pnpm", "local:verify", "--", "--phase5-full", "--interruption-check", "--parallel-check"]);
const requiredScope = "local-generated-production-pipeline-and-fake-fault-only";

function fail(message) { throw new Error(`phase5 receipt ${message}`); }

function strictObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) fail(`${label} is invalid`);
  return value;
}

function isIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && /[zZ]|[+-]\d\d:\d\d$/.test(value);
}

function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
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
  if (value.format !== "blog-x-phase5-suite-manifest" || value.version !== 1 || !Array.isArray(value.suites) || !value.suites.length) fail("suite manifest is invalid");
  const ids = new Set();
  for (const suite of value.suites) {
    strictObject(suite, ["id", "kind", "path", "sourceSha256"], "suite manifest entry");
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(suite.id) || !["node", "database", "browser", "pipeline", "boundary"].includes(suite.kind)
      || !/^(?:apps|scripts)\/[a-zA-Z0-9_./-]+\.(?:mjs|ts|tsx)$/.test(suite.path) || suite.path.includes("..") || !digestPattern.test(suite.sourceSha256) || ids.has(suite.id)) fail("suite manifest is invalid");
    ids.add(suite.id);
  }
  return value;
}

function parseSuiteResults(value, manifest) {
  if (!Array.isArray(value) || value.length !== manifest.suites.length) fail("suite results are incomplete");
  const manifestById = new Map(manifest.suites.map((suite) => [suite.id, suite]));
  const ids = new Set();
  for (const suite of value) {
    strictObject(suite, ["failed", "id", "outcome", "passed", "resultSha256", "skipped", "sourceSha256", "tests", "todo"], "suite result");
    const expected = manifestById.get(suite.id);
    if (!expected || ids.has(suite.id) || suite.sourceSha256 !== expected.sourceSha256 || !digestPattern.test(suite.resultSha256)
      || suite.outcome !== "pass" || !Number.isSafeInteger(suite.tests) || suite.tests <= 0
      || !Number.isSafeInteger(suite.passed) || suite.passed !== suite.tests
      || !Number.isSafeInteger(suite.failed) || suite.failed !== 0
      || !Number.isSafeInteger(suite.skipped) || suite.skipped !== 0
      || !Number.isSafeInteger(suite.todo) || suite.todo !== 0) fail("suite result is invalid");
    ids.add(suite.id);
  }
  return value;
}

export const phase5ReceiptSchema = {
  parse(value) {
    strictObject(value, ["canonicalDecisionSha256", "canonicalDecisionState", "canonicalEvidenceSha256", "command", "completedAt", "format", "implementationRevision", "mode", "scope", "startedAt", "suiteManifest", "suiteManifestSha256", "suites", "version"], "receipt");
    if (value.format !== "blog-x-phase5-full-gate-receipt" || value.version !== 1 || !revisionPattern.test(value.implementationRevision)
      || !Array.isArray(value.command) || JSON.stringify(value.command) !== JSON.stringify(requiredCommand)
      || value.mode !== "phase5-full" || value.scope !== requiredScope || !isIso(value.startedAt) || !isIso(value.completedAt)
      || Date.parse(value.startedAt) > Date.parse(value.completedAt) || !digestPattern.test(value.suiteManifestSha256)
      || !digestPattern.test(value.canonicalEvidenceSha256) || !digestPattern.test(value.canonicalDecisionSha256)
      || value.canonicalDecisionState !== "BLOCKED") fail("schema is invalid");
    const manifest = parseManifest(value.suiteManifest);
    if (hashBytes(JSON.stringify(manifest)) !== value.suiteManifestSha256) fail("suite manifest digest is invalid");
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

export async function hashPhase5Receipt(receiptPath = fixedReceiptPath) {
  return hashBytes(await readReceiptBytes(receiptPath));
}

export async function verifyPhase5Receipt(receiptPath = fixedReceiptPath) {
  const bytes = await readReceiptBytes(receiptPath);
  const receipt = phase5ReceiptSchema.parse(JSON.parse(bytes.toString("utf8")));
  return { path: validateReceiptPath(receiptPath), receipt, sha256: hashBytes(bytes) };
}

export async function writePhase5ReceiptAtomic(value, options = {}) {
  const receipt = phase5ReceiptSchema.parse(JSON.parse(JSON.stringify(value)));
  if (options.cleanWorktree !== true) fail("requires a clean committed implementation");
  if (!revisionPattern.test(options.expectedRevision ?? "") || options.expectedRevision !== receipt.implementationRevision) fail("revision does not match committed HEAD");
  const target = validateReceiptPath(options.receiptPath ?? fixedReceiptPath);
  const parent = dirname(target);
  const parentInfo = await lstat(parent).catch(() => fail("parent is missing"));
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) fail("parent is unsafe");
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
  const temporary = resolve(parent, `.${basename(target)}.incomplete-${randomBytes(12).toString("hex")}`);
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await syncPath(temporary);
    await options.beforeRename?.(temporary);
    phase5ReceiptSchema.parse(JSON.parse((await readFile(temporary)).toString("utf8")));
    await rename(temporary, target);
    await syncPath(parent);
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
