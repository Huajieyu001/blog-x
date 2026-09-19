import { randomBytes, X509Certificate } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const maximumCertificateBytes = 64 * 1024;
const format = "blog-x-tls-evidence";
const version = 1;
const certificatePattern = /^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END CERTIFICATE-----\r?\n?$/;

function reject(category) {
  throw new Error(`tls evidence ${category} rejected`);
}

function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function ownerUid(value) {
  if (typeof value !== "function") return null;
  const uid = value();
  return Number.isSafeInteger(uid) && uid >= 0 ? uid : null;
}

function canonicalAbsolute(value) {
  return typeof value === "string" && value.length > 0 && isAbsolute(value) && resolve(value) === value;
}

function safeOwnerFile(info, uid, { exactMode = false } = {}) {
  if (!info?.isFile?.() || info.isSymbolicLink?.() || info.uid !== uid || info.nlink !== 1) return false;
  const mode = info.mode & 0o777;
  return exactMode ? mode === 0o600 : (mode & 0o022) === 0;
}

function safeOwnerDirectory(info, uid) {
  return Boolean(info?.isDirectory?.() && !info.isSymbolicLink?.() && info.uid === uid && (info.mode & 0o077) === 0);
}

function exactPemCertificate(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maximumCertificateBytes) reject("certificate");
  const text = bytes.toString("utf8");
  if (!certificatePattern.test(text)) reject("certificate");
  return text;
}

function evidenceFor(certificate, now) {
  const observedAt = now instanceof Date ? now.getTime() : Number.NaN;
  const validFrom = Date.parse(certificate.validFrom);
  const validUntil = Date.parse(certificate.validTo);
  if (!Number.isFinite(observedAt) || !Number.isFinite(validFrom) || !Number.isFinite(validUntil) || validFrom > observedAt || validUntil <= observedAt) reject("certificate");
  return {
    format,
    version,
    observedAt: now.toISOString(),
    validUntil: new Date(validUntil).toISOString(),
    status: "pass",
  };
}

async function assertCertificateAuthority(certificatePath, fs, uid) {
  if (!canonicalAbsolute(certificatePath)) reject("certificate");
  let before;
  try {
    before = await fs.lstat(certificatePath);
    if (!safeOwnerFile(before, uid) || await fs.realpath(certificatePath) !== certificatePath) reject("certificate");
  } catch (error) {
    if (error?.message === "tls evidence certificate rejected") throw error;
    reject("certificate");
  }
  let handle;
  try {
    handle = await fs.open(certificatePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!safeOwnerFile(opened, uid) || !sameStat(before, opened)) reject("certificate");
    const bytes = await handle.readFile();
    const after = await fs.lstat(certificatePath);
    if (!safeOwnerFile(after, uid) || !sameStat(opened, after)) reject("certificate");
    return exactPemCertificate(bytes);
  } catch (error) {
    if (error?.message === "tls evidence certificate rejected") throw error;
    reject("certificate");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function assertOutputAuthority(outputPath, fs, uid) {
  if (!canonicalAbsolute(outputPath)) reject("output");
  const parent = dirname(outputPath);
  let parentInfo;
  try {
    parentInfo = await fs.lstat(parent);
    if (!safeOwnerDirectory(parentInfo, uid) || await fs.realpath(parent) !== parent) reject("output");
  } catch (error) {
    if (error?.message === "tls evidence output rejected") throw error;
    reject("output");
  }
  try {
    const target = await fs.lstat(outputPath);
    if (!safeOwnerFile(target, uid, { exactMode: true }) || await fs.realpath(outputPath) !== outputPath) reject("output");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      if (error?.message === "tls evidence output rejected") throw error;
      reject("output");
    }
  }
  return parent;
}

function temporaryPath(parent, random = randomBytes) {
  const entropy = random(18);
  if (!Buffer.isBuffer(entropy) || entropy.length < 16) reject("publish");
  return resolve(parent, `.tls-evidence-${entropy.toString("hex")}.tmp`);
}

async function syncDirectory(parent, fs) {
  let directory;
  try {
    directory = await fs.open(parent, constants.O_RDONLY);
    await directory.sync();
  } finally {
    await directory?.close().catch(() => undefined);
  }
}

/** Publishes strict, secret-free certificate-expiry evidence from one local public PEM. */
export async function produceTlsEvidence({ certificatePath, outputPath }, dependencies = {}) {
  const fs = dependencies.fs ?? { lstat, open, readFile, realpath, rename, unlink };
  const uid = dependencies.uid ?? ownerUid(process.getuid);
  const now = (dependencies.now ?? (() => new Date()))();
  if (uid === null) reject("certificate");
  const certificateText = await assertCertificateAuthority(certificatePath, fs, uid);
  let certificate;
  try { certificate = new X509Certificate(certificateText); } catch { reject("certificate"); }
  const evidence = evidenceFor(certificate, now);
  const parent = await assertOutputAuthority(outputPath, fs, uid);
  const temporary = temporaryPath(parent, dependencies.randomBytes);
  const serialized = `${JSON.stringify(evidence)}\n`;
  let handle;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertOutputAuthority(outputPath, fs, uid);
    await fs.rename(temporary, outputPath);
    await syncDirectory(parent, fs);
    return evidence;
  } catch (error) {
    if (error?.message === "tls evidence output rejected") throw error;
    reject("publish");
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporary).catch(() => undefined);
  }
}

/** Parses the single supported local-only operator invocation. */
export function parseTlsEvidenceArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 2) reject("arguments");
  const values = new Map();
  for (const argument of argv) {
    if (typeof argument !== "string" || !argument.startsWith("--")) reject("arguments");
    const match = /^--(certificate|output)=([^\s]+)$/.exec(argument);
    if (!match || values.has(match[1])) reject("arguments");
    values.set(match[1], match[2]);
  }
  const certificatePath = values.get("certificate");
  const outputPath = values.get("output");
  if (!canonicalAbsolute(certificatePath) || !canonicalAbsolute(outputPath) || /^https?:/i.test(certificatePath) || /^https?:/i.test(outputPath)) reject("arguments");
  return { certificatePath, outputPath };
}

async function main() {
  try {
    await produceTlsEvidence(parseTlsEvidenceArgs(process.argv.slice(2)));
    process.stdout.write("BLOG X TLS EVIDENCE PASS\n");
  } catch {
    process.stdout.write("BLOG X TLS EVIDENCE FAIL\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
