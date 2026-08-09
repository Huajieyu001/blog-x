import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const digestPattern = /^[a-f0-9]{64}$/;
const setPattern = /^\d{8}T\d{6}Z-[a-z0-9]{8,32}$/;
const generatedKeyBasePattern = /^blog-x-production-key-[A-Za-z0-9_-]{6,64}$/;

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
