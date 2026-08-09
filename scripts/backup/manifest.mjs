import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { assertNotLink, validateBackupStaging, validateFinalBackupRoot } from "./paths.mjs";

const hashPattern = /^[a-f0-9]{64}$/;
const memberPattern = /^(?:database\.dump|portable-export-v1\.json|config\/inventory\.json|media\/(?:source|derivative)\/[0-9a-f-]{36}\.(?:bin|jpg|png|webp))$/i;

function strictObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw new Error(`${label} is invalid`);
  return value;
}

export const backupManifestSchema = {
  parse(value) {
    strictObject(value, ["createdAt", "format", "members", "setId", "toolVersion", "version"], "manifest");
    if (value.format !== "blog-x-backup-set" || value.version !== 1 || value.toolVersion !== "04-02" || !/^\d{8}T\d{6}Z-[a-z0-9]{8,32}$/.test(value.setId)
      || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.members) || value.members.length < 3) throw new Error("manifest format is unsupported");
    let previous = "";
    const seen = new Set();
    for (const member of value.members) {
      strictObject(member, ["bytes", "path", "sha256"], "manifest member");
      if (!memberPattern.test(member.path) || member.path.includes("..") || seen.has(member.path) || member.path <= previous
        || !Number.isSafeInteger(member.bytes) || member.bytes <= 0 || !hashPattern.test(member.sha256)) throw new Error(`manifest member is invalid: ${member.path ?? "unknown"}`);
      seen.add(member.path); previous = member.path;
    }
    for (const required of ["config/inventory.json", "database.dump", "portable-export-v1.json"]) if (!seen.has(required)) throw new Error(`manifest member is missing: ${required}`);
    return value;
  },
};

export const completenessMarkerSchema = {
  parse(value) {
    strictObject(value, ["format", "manifestSha256", "version"], "completeness marker");
    if (value.format !== "blog-x-backup-complete" || value.version !== 1 || !hashPattern.test(value.manifestSha256)) throw new Error("completeness marker is invalid");
    return value;
  },
};

export async function hashFile(path) {
  const hash = createHash("sha256");
  await new Promise((accept, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", accept);
  });
  return hash.digest("hex");
}

async function listFiles(root, directory = root) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const member = relative(root, path).split(sep).join("/");
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`backup member is a link: ${member}`);
    if (info.isDirectory()) output.push(...await listFiles(root, path));
    else if (info.isFile()) output.push(member);
    else throw new Error(`backup member type is unsupported: ${member}`);
  }
  return output.sort();
}

function parsePortable(value) {
  strictObject(value, ["about", "articles", "categories", "exportedAt", "format", "media", "tags", "version"], "portable export");
  if (value.format !== "blog-x-portable-export" || value.version !== 1 || !Number.isFinite(Date.parse(value.exportedAt))
    || ![value.articles, value.categories, value.tags, value.media].every(Array.isArray)) throw new Error("portable export is invalid");
}

function parseInventory(value) {
  strictObject(value, ["configChecksums", "format", "images", "media", "mediaRootRole", "migration", "secretAuthorityRef", "variableNamesPresent", "version"], "config inventory");
  if (value.format !== "blog-x-backup-config-inventory" || value.version !== 1 || value.mediaRootRole !== "api-owned-source-and-derivative"
    || !/^external:[a-z0-9-]+$/.test(value.secretAuthorityRef) || !Array.isArray(value.media) || !Array.isArray(value.configChecksums) || !Array.isArray(value.variableNamesPresent)) throw new Error("config inventory is invalid");
  const serialized = JSON.stringify(value);
  if (/postgres(?:ql)?:\/\/|-----BEGIN|\b(?:password|cookie|token)\b/i.test(serialized)) throw new Error("config inventory contains credential-like material");
  for (const item of value.media) {
    strictObject(item, ["derivativePath", "derivativeSha256", "id", "sourcePath", "sourceSha256"], "media inventory");
    if (!/^[0-9a-f-]{36}$/i.test(item.id) || !hashPattern.test(item.sourceSha256) || !hashPattern.test(item.derivativeSha256)
      || !memberPattern.test(item.sourcePath) || !memberPattern.test(item.derivativePath)) throw new Error("media inventory is invalid");
  }
  return value;
}

export async function verifyBackupSet(root) {
  const backupRoot = (() => { try { return validateFinalBackupRoot(root); } catch { return validateBackupStaging(root); } })();
  await assertNotLink(backupRoot, "backup set");
  const markerPath = resolve(backupRoot, "COMPLETE");
  const manifestPath = resolve(backupRoot, "manifest.json");
  const marker = completenessMarkerSchema.parse(JSON.parse(await readFile(markerPath, "utf8").catch(() => { throw new Error("COMPLETE marker is missing"); })));
  const manifestText = await readFile(manifestPath, "utf8").catch(() => { throw new Error("manifest.json is missing"); });
  if (createHash("sha256").update(manifestText).digest("hex") !== marker.manifestSha256) throw new Error("COMPLETE marker manifest checksum mismatch");
  const manifest = backupManifestSchema.parse(JSON.parse(manifestText));
  const actual = await listFiles(backupRoot);
  const expected = [...manifest.members.map((item) => item.path), "COMPLETE", "manifest.json"].sort();
  const extra = actual.find((item) => !expected.includes(item));
  const missing = expected.find((item) => !actual.includes(item));
  if (extra) throw new Error(`extra backup member: ${extra}`);
  if (missing) throw new Error(`missing backup member: ${missing}`);
  for (const member of manifest.members) {
    const path = resolve(backupRoot, member.path);
    const info = await assertNotLink(path, `backup member ${member.path}`);
    if (info.size !== member.bytes) throw new Error(`backup member size mismatch: ${member.path}`);
    if (await hashFile(path) !== member.sha256) throw new Error(`backup member checksum mismatch: ${member.path}`);
  }
  parsePortable(JSON.parse(await readFile(resolve(backupRoot, "portable-export-v1.json"), "utf8")));
  const inventory = parseInventory(JSON.parse(await readFile(resolve(backupRoot, "config/inventory.json"), "utf8")));
  const memberMap = new Map(manifest.members.map((item) => [item.path, item]));
  for (const media of inventory.media) {
    if (memberMap.get(media.sourcePath)?.sha256 !== media.sourceSha256) throw new Error(`source media checksum mismatch: ${media.sourcePath}`);
    if (memberMap.get(media.derivativePath)?.sha256 !== media.derivativeSha256) throw new Error(`derivative media checksum mismatch: ${media.derivativePath}`);
  }
  const mediaMembers = manifest.members.filter((item) => item.path.startsWith("media/")).map((item) => item.path);
  const inventoried = inventory.media.flatMap((item) => [item.sourcePath, item.derivativePath]).sort();
  if (JSON.stringify(mediaMembers.sort()) !== JSON.stringify(inventoried)) throw new Error("media member inventory mismatch");
  return { manifest, marker, inventory };
}

export async function createManifest(root, setId, createdAt) {
  const files = (await listFiles(root)).filter((item) => item !== "manifest.json" && item !== "COMPLETE");
  const members = [];
  for (const path of files) {
    if (!memberPattern.test(path)) throw new Error(`extra backup payload member: ${path}`);
    const full = resolve(root, path);
    const info = await lstat(full);
    members.push({ path, bytes: info.size, sha256: await hashFile(full) });
  }
  return backupManifestSchema.parse({ format: "blog-x-backup-set", version: 1, setId, createdAt, toolVersion: "04-02", members: members.sort((a, b) => a.path.localeCompare(b.path)) });
}
