import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, lstatSync, readFileSync, realpathSync } from "node:fs";
import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createManifest } from "../manifest.mjs";
import { verifyCompleteBackupSetContents } from "../content-verifier.mjs";

const digestPattern = /^[a-f0-9]{64}$/;
const setPattern = /^\d{8}T\d{6}Z-[a-z0-9]{8,32}$/;
const generatedKeyBasePattern = /^blog-x-production-key-[A-Za-z0-9_-]{6,64}$/;
const generatedRecoveryStagingPattern = /^blog-x-backup-verify-recovery-[a-z0-9]{8,32}$/;
const backupMemberPattern = /^(?:database\.dump|portable-export-v1\.json|config\/inventory\.json|media\/(?:source|derivative)\/[0-9a-f-]{36}\.(?:bin|jpg|png|webp))$/i;

function fail(message) {
  throw new Error(`production encryption ${message}`);
}

function strictObject(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function restrictiveRegularFile(path, label) {
  let info;
  try { info = lstatSync(path); } catch { fail(`${label} is missing`); }
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail(`${label} is unsafe`);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) fail(`${label} ownership is invalid`);
  try { return realpathSync(path); } catch { fail(`${label} cannot be resolved`); }
}

export function readProductionDataKey(authority) {
  if (!strictObject(authority, ["keyPath", "kind"]) || (authority.kind !== "generated-test" && authority.kind !== "service") || typeof authority.keyPath !== "string" || authority.keyPath.includes("${") || authority.keyPath.includes("..")) fail("authority is invalid");
  const keyPath = resolve(authority.keyPath);
  const workspace = resolve(process.cwd());
  if (keyPath === "/" || keyPath.startsWith(`${workspace}/`)) fail("authority is broad");
  if (authority.kind === "generated-test") {
    if (basename(keyPath) !== "data.key" || dirname(dirname(keyPath)) !== resolve(tmpdir()) || !generatedKeyBasePattern.test(basename(dirname(keyPath)))) fail("generated key authority is invalid");
  } else if (keyPath === resolve(tmpdir()) || keyPath.startsWith(`${resolve(tmpdir())}/`)) {
    fail("service key authority is invalid");
  }
  restrictiveRegularFile(keyPath, "key authority");
  const key = readFileSync(keyPath);
  if (key.length !== 32) fail("must contain exactly 32 key bytes");
  return key;
}

export function canonicalBackupAad(value) {
  if (!strictObject(value, ["createdAt", "destinationProfileId", "manifestSha256", "retentionPolicyId", "setId"]) || !setPattern.test(value.setId ?? "")
    || !digestPattern.test(value.manifestSha256 ?? "") || typeof value.destinationProfileId !== "string" || !/^[a-z0-9-]{3,80}$/.test(value.destinationProfileId)
    || typeof value.retentionPolicyId !== "string" || !/^[a-z0-9-]{3,80}$/.test(value.retentionPolicyId) || !Number.isFinite(Date.parse(value.createdAt))) fail("AAD facts are invalid");
  return Buffer.from(JSON.stringify({ format: "blog-x-backup-encryption", version: 1, ...value }));
}

export async function encryptBackupPayload({ sourceRoot, manifest, marker, createdAt, retentionPolicyId, destinationProfileId, keyAuthority }) {
  if (!manifest || !Array.isArray(manifest.members) || !marker || !digestPattern.test(marker.manifestSha256 ?? "")) fail("source manifest is invalid");
  const aad = canonicalBackupAad({ setId: manifest.setId, manifestSha256: marker.manifestSha256, createdAt, retentionPolicyId, destinationProfileId });
  const key = readProductionDataKey(keyAuthority);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const chunks = [Buffer.from("BXE1"), nonce];
  for (const member of manifest.members) {
    const header = Buffer.from(`${JSON.stringify({ path: member.path, bytes: member.bytes, sha256: member.sha256 })}\n`);
    const encryptedHeader = cipher.update(header);
    if (encryptedHeader.length) chunks.push(encryptedHeader);
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of createReadStream(resolve(sourceRoot, member.path))) {
      hash.update(chunk);
      bytes += chunk.length;
      const encrypted = cipher.update(chunk);
      if (encrypted.length) chunks.push(encrypted);
    }
    if (bytes !== member.bytes || hash.digest("hex") !== member.sha256) fail(`source member changed during encryption: ${member.path}`);
  }
  const final = cipher.final();
  if (final.length) chunks.push(final);
  chunks.push(cipher.getAuthTag());
  const ciphertext = Buffer.concat(chunks);
  return {
    ciphertext,
    ciphertextSha256: createHash("sha256").update(ciphertext).digest("hex"),
    aadSha256: createHash("sha256").update(aad).digest("hex"),
    manifestSha256: marker.manifestSha256,
  };
}

function parseReceipt(value) {
  if (!strictObject(value, ["aadSha256", "ciphertextSha256", "createdAt", "destinationProfileId", "format", "manifestSha256", "setId", "version"])
    || value.format !== "blog-x-backup-receipt" || value.version !== 1 || !setPattern.test(value.setId ?? "")
    || !digestPattern.test(value.aadSha256 ?? "") || !digestPattern.test(value.ciphertextSha256 ?? "") || !digestPattern.test(value.manifestSha256 ?? "")
    || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.destinationProfileId !== "string") fail("receipt is invalid");
  return value;
}

function validateStagingRoot(value) {
  if (typeof value !== "string" || !value || value.includes("${") || value.includes("..")) fail("recovery staging root is invalid");
  const root = resolve(value);
  if (dirname(root) !== resolve(tmpdir()) || !generatedRecoveryStagingPattern.test(basename(root))) fail("recovery staging root is invalid");
  return root;
}

function parseMemberHeader(bytes, offset, previous) {
  const newline = bytes.indexOf(0x0a, offset);
  if (newline < 0 || bytes[offset] !== 0x7b) fail("member framing is invalid");
  let member;
  try { member = JSON.parse(bytes.subarray(offset, newline).toString("utf8")); } catch { fail("member header is invalid"); }
  if (!strictObject(member, ["bytes", "path", "sha256"]) || !backupMemberPattern.test(member.path ?? "") || member.path <= previous
    || !Number.isSafeInteger(member.bytes) || member.bytes <= 0 || !digestPattern.test(member.sha256 ?? "")) fail("member header is invalid");
  return { member, bodyOffset: newline + 1 };
}

export async function decryptBackupPayload({ ciphertext, receipt: rawReceipt, retentionPolicyId, keyAuthority, stagingRoot }) {
  const receipt = parseReceipt(rawReceipt);
  if (!Buffer.isBuffer(ciphertext) || ciphertext.length < 4 + 12 + 16 || createHash("sha256").update(ciphertext).digest("hex") !== receipt.ciphertextSha256) fail("ciphertext digest mismatch");
  const aad = canonicalBackupAad({ setId: receipt.setId, manifestSha256: receipt.manifestSha256, createdAt: receipt.createdAt, retentionPolicyId, destinationProfileId: receipt.destinationProfileId });
  if (createHash("sha256").update(aad).digest("hex") !== receipt.aadSha256) fail("AAD digest mismatch");
  if (!ciphertext.subarray(0, 4).equals(Buffer.from("BXE1"))) fail("ciphertext magic is invalid");
  const root = validateStagingRoot(stagingRoot);
  const existing = await lstat(root).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existing) fail("recovery staging root already exists");
  const key = readProductionDataKey(keyAuthority);
  let plaintext;
  try {
    const nonce = ciphertext.subarray(4, 16);
    const tag = ciphertext.subarray(ciphertext.length - 16);
    const encrypted = ciphertext.subarray(16, ciphertext.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch { fail("ciphertext authentication failed"); }
  try {
    await mkdir(root, { mode: 0o700 });
    const backupRoot = resolve(root, receipt.setId);
    await mkdir(backupRoot, { mode: 0o700 });
    let offset = 0;
    let previous = "";
    const members = [];
    while (offset < plaintext.length) {
      const { member, bodyOffset } = parseMemberHeader(plaintext, offset, previous);
      const end = bodyOffset + member.bytes;
      if (end > plaintext.length) fail("member byte count is invalid");
      const target = resolve(backupRoot, member.path);
      if (relative(backupRoot, target).startsWith("..") || target === backupRoot) fail("member path escapes staging root");
      const contents = plaintext.subarray(bodyOffset, end);
      if (createHash("sha256").update(contents).digest("hex") !== member.sha256) fail("member digest is invalid");
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, contents, { flag: "wx", mode: 0o600 });
      members.push(member);
      previous = member.path;
      offset = end;
    }
    if (!members.length) fail("ciphertext has no members");
    const manifest = await createManifest(backupRoot, receipt.setId, receipt.createdAt);
    if (JSON.stringify(manifest.members) !== JSON.stringify(members)) fail("member manifest is not canonical");
    const manifestText = JSON.stringify(manifest);
    if (createHash("sha256").update(manifestText).digest("hex") !== receipt.manifestSha256) fail("manifest digest mismatch");
    await writeFile(resolve(backupRoot, "manifest.json"), manifestText, { flag: "wx", mode: 0o600 });
    await writeFile(resolve(backupRoot, "COMPLETE"), JSON.stringify({ format: "blog-x-backup-complete", version: 1, manifestSha256: receipt.manifestSha256 }), { flag: "wx", mode: 0o600 });
    const verified = await verifyCompleteBackupSetContents(backupRoot, async (candidate) => candidate === backupRoot ? backupRoot : Promise.reject(new Error("recovery root is invalid")));
    return { backupRoot, manifest: verified.manifest, inventory: verified.inventory };
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function cleanupDecryptedBackup(value) {
  const root = validateStagingRoot(value);
  const info = await lstat(root).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (info?.isSymbolicLink()) fail("recovery cleanup target is a link");
  await rm(root, { recursive: true, force: true });
}
