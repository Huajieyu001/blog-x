import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import * as filesystem from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createManifest, hashFile } from "../manifest.mjs";
import { verifyCompleteBackupSetContents } from "../content-verifier.mjs";
import { parseProductionBackupPolicy } from "./policy.mjs";
import {
  validateProductionBackupStaging,
  validateProductionSourceBase,
  verifyProductionBackupSource,
} from "./source-authority.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const composeFile = resolve(repositoryRoot, "compose.yaml");
const fixedConfigInventoryPaths = new Set(["compose.yaml", "ops/backup-policy.names.json", "ops/topology-policy.json"]);
const mediaIdPattern = /^[0-9a-f-]{36}$/i;
const sourceKeyPattern = /^source\/([0-9a-f-]{36})\.bin$/i;
const derivativeKeyPattern = /^derivative\/([0-9a-f-]{36})\.(jpg|png|webp)$/i;
const digestPattern = /^[a-f0-9]{64}$/;

function failure(message) {
  throw new Error(`production collector ${message}`);
}

function fixedCommand(name, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(name, args, { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"], env: options.env ?? process.env });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? accept(Buffer.concat(output)) : reject(new Error("fixed production collector operation failed")));
  });
}

function fixedCompose(policy, ...args) {
  return fixedCommand("docker-compose", ["-p", policy.collector.project, "-f", composeFile, ...args]);
}

async function defaultDumpPostgresCustom({ policy }) {
  return fixedCompose(policy, "exec", "-T", "postgres", "pg_dump", "-U", "blog_x", "-d", policy.collector.database, "-Fc");
}

async function defaultWritePortableExportV1({ policy }) {
  return fixedCompose(policy, "exec", "-T", "api", "corepack", "pnpm", "--filter", "@blog-x/api", "exec", "tsx", "src/app.ts", "portable-export");
}

async function defaultCopyApiMedia({ policy, stage, files }) {
  const mediaRows = (await fixedCompose(policy, "exec", "-T", "postgres", "psql", "-U", "blog_x", "-d", policy.collector.database, "-At", "-F", "|", "-c", "select id, source_key, derivative_key from media order by id")).toString();
  const containerId = (await fixedCompose(policy, "ps", "-q", "api")).toString().trim();
  if (!/^[a-f0-9]{12,64}$/.test(containerId)) failure("API container is unavailable");
  const media = [];
  for (const line of mediaRows.split(/\r?\n/).filter(Boolean)) {
    const [id, sourceKey, derivativeKey] = line.split("|");
    const sourceMatch = sourceKeyPattern.exec(sourceKey ?? "");
    const derivativeMatch = derivativeKeyPattern.exec(derivativeKey ?? "");
    if (!mediaIdPattern.test(id ?? "") || sourceMatch?.[1].toLowerCase() !== id.toLowerCase() || derivativeMatch?.[1].toLowerCase() !== id.toLowerCase()) failure("database media inventory is invalid");
    const sourcePath = resolve(stage, "media", sourceKey);
    const derivativePath = resolve(stage, "media", derivativeKey);
    await files.mkdir(dirname(sourcePath), { recursive: true, mode: 0o700 });
    await files.mkdir(dirname(derivativePath), { recursive: true, mode: 0o700 });
    await fixedCommand("docker", ["cp", `${containerId}:${policy.collector.mediaRoot}/${sourceKey}`, sourcePath]);
    await fixedCommand("docker", ["cp", `${containerId}:${policy.collector.mediaRoot}/${derivativeKey}`, derivativePath]);
    media.push({ id, sourceKey, derivativeKey });
  }
  return media;
}

async function defaultReadAllowlistedInventory({ policy }) {
  const ledger = (await fixedCompose(policy, "exec", "-T", "postgres", "psql", "-U", "blog_x", "-d", policy.collector.database, "-At", "-F", "|", "-c", "select migration_count, migration_fingerprint from blog_x_schema_ledger where scope = 'phase1'")).toString().trim().split("|");
  const config = JSON.parse((await fixedCompose(policy, "config", "--format", "json")).toString());
  const images = {};
  for (const name of ["api", "web", "postgres"]) images[name] = `sha256:${(await fixedCommand("docker", ["image", "inspect", "--format", "{{.Id}}", config.services[name].image])).toString().trim().replace(/^sha256:/, "")}`;
  const configChecksums = [];
  for (const path of fixedConfigInventoryPaths) {
    const absolute = resolve(repositoryRoot, path);
    configChecksums.push({ path, sha256: await hashFile(absolute) });
  }
  return {
    migration: { count: Number(ledger[0]), fingerprint: ledger[1] }, images, configChecksums,
    variableNamesPresent: ["DATABASE_URL", "MEDIA_ROOT", "PUBLIC_ORIGIN"], secretAuthorityRef: "external:service-secret-authority",
  };
}

function setIdFor(now) {
  const value = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `${value}-${randomBytes(8).toString("hex")}`;
}

function toBuffer(value, label) {
  const buffer = Buffer.isBuffer(value) ? value : typeof value === "string" ? Buffer.from(value) : null;
  if (!buffer || buffer.length === 0) failure(`${label} is empty`);
  return buffer;
}

function parsePortableMedia(value) {
  let parsed;
  try { parsed = JSON.parse(value); } catch { failure("portable export is invalid"); }
  if (!parsed || parsed.format !== "blog-x-portable-export" || parsed.version !== 1 || !Array.isArray(parsed.media)) failure("portable export is invalid");
  const ids = new Set();
  for (const item of parsed.media) {
    if (!item || !mediaIdPattern.test(item.id ?? "") || ids.has(item.id.toLowerCase())) failure("portable media inventory is invalid");
    ids.add(item.id.toLowerCase());
  }
  return ids;
}

function normalizedMedia(entry) {
  if (!entry || typeof entry !== "object" || !mediaIdPattern.test(entry.id ?? "")) failure("media operation result is invalid");
  const source = sourceKeyPattern.exec(entry.sourceKey ?? "");
  const derivative = derivativeKeyPattern.exec(entry.derivativeKey ?? "");
  if (source?.[1].toLowerCase() !== entry.id.toLowerCase() || derivative?.[1].toLowerCase() !== entry.id.toLowerCase()) failure("media operation result is invalid");
  return { id: entry.id.toLowerCase(), sourceKey: entry.sourceKey, derivativeKey: entry.derivativeKey, source: entry.source, derivative: entry.derivative };
}

export function createProductionInventory(value) {
  if (!value || typeof value !== "object" || !value.migration || !value.images || !Array.isArray(value.configChecksums)
    || !Array.isArray(value.variableNamesPresent) || typeof value.secretAuthorityRef !== "string") failure("allowlisted inventory is invalid");
  if (!Number.isSafeInteger(value.migration.count) || value.migration.count !== 9 || !digestPattern.test(value.migration.fingerprint ?? "")) failure("migration inventory is invalid");
  if (Object.keys(value.images).sort().join(",") !== "api,postgres,web" || Object.values(value.images).some((item) => typeof item !== "string" || !/^sha256:[a-f0-9]{64}$/.test(item))) failure("image inventory is invalid");
  for (const item of value.configChecksums) if (!item || !fixedConfigInventoryPaths.has(item.path) || !digestPattern.test(item.sha256 ?? "")) failure("config inventory is not allowlisted");
  if (!/^external:[a-z0-9-]+$/.test(value.secretAuthorityRef)) failure("secret authority reference is invalid");
  return {
    format: "blog-x-backup-config-inventory", version: 1, migration: { ...value.migration }, images: { ...value.images },
    configChecksums: value.configChecksums.map((item) => ({ path: item.path, sha256: item.sha256 })),
    variableNamesPresent: [...value.variableNamesPresent], mediaRootRole: "api-owned-source-and-derivative",
    secretAuthorityRef: value.secretAuthorityRef, media: Array.isArray(value.media) ? value.media.map((item) => ({ ...item })) : [],
  };
}

async function fsync(path, files) {
  const handle = await files.open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function absent(path, files, label) {
  try { await files.lstat(path); failure(`${label} collision exists`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}

export async function collectProductionBackupSet(input, dependencies = {}) {
  const policy = parseProductionBackupPolicy(input);
  const files = dependencies.filesystem ?? filesystem;
  const authority = validateProductionSourceBase(policy.sourceAuthority);
  const now = dependencies.now ?? (() => new Date());
  const setId = setIdFor(now());
  const finalRoot = resolve(authority.sourceBase, setId);
  const stagingRoot = resolve(authority.sourceBase, `.${setId}.incomplete-${randomBytes(16).toString("hex")}`);
  const operations = {
    dumpPostgresCustom: dependencies.dumpPostgresCustom ?? defaultDumpPostgresCustom,
    writePortableExportV1: dependencies.writePortableExportV1 ?? defaultWritePortableExportV1,
    copyApiMedia: dependencies.copyApiMedia ?? defaultCopyApiMedia,
    readAllowlistedInventory: dependencies.readAllowlistedInventory ?? defaultReadAllowlistedInventory,
  };
  const priorUmask = process.umask(0o077);
  try {
    await absent(finalRoot, files, "final set");
    await absent(stagingRoot, files, "staging set");
    await files.mkdir(stagingRoot, { mode: 0o700 });
    validateProductionBackupStaging(stagingRoot, policy.sourceAuthority);
    const context = { policy, stage: stagingRoot, files };
    const dump = toBuffer(await operations.dumpPostgresCustom(context), "database dump");
    await files.writeFile(resolve(stagingRoot, "database.dump"), dump, { flag: "wx", mode: 0o600 });
    const portable = toBuffer(await operations.writePortableExportV1(context), "portable export");
    const portableText = portable.toString("utf8");
    const portableIds = parsePortableMedia(portableText);
    await files.writeFile(resolve(stagingRoot, "portable-export-v1.json"), portable, { flag: "wx", mode: 0o600 });
    const media = (await operations.copyApiMedia(context)).map(normalizedMedia);
    const mediaIds = new Set();
    for (const item of media) {
      if (mediaIds.has(item.id)) failure("media operation returned duplicate IDs");
      mediaIds.add(item.id);
      const sourcePath = resolve(stagingRoot, "media", item.sourceKey);
      const derivativePath = resolve(stagingRoot, "media", item.derivativeKey);
      if (item.source !== undefined) await files.mkdir(dirname(sourcePath), { recursive: true, mode: 0o700 }).then(() => files.writeFile(sourcePath, toBuffer(item.source, "source media"), { flag: "wx", mode: 0o600 }));
      if (item.derivative !== undefined) await files.mkdir(dirname(derivativePath), { recursive: true, mode: 0o700 }).then(() => files.writeFile(derivativePath, toBuffer(item.derivative, "derivative media"), { flag: "wx", mode: 0o600 }));
      const [sourceInfo, derivativeInfo] = await Promise.all([files.lstat(sourcePath), files.lstat(derivativePath)]);
      if (!sourceInfo.isFile() || !derivativeInfo.isFile() || sourceInfo.isSymbolicLink() || derivativeInfo.isSymbolicLink()) failure("media copy output is unsafe");
    }
    if (JSON.stringify([...portableIds].sort()) !== JSON.stringify([...mediaIds].sort())) failure("portable media inventory does not match copied media");
    const inventoryInput = await operations.readAllowlistedInventory(context);
    const inventoryMedia = [];
    for (const item of media) {
      const sourcePath = `media/${item.sourceKey}`;
      const derivativePath = `media/${item.derivativeKey}`;
      inventoryMedia.push({ id: item.id, sourcePath, derivativePath, sourceSha256: await hashFile(resolve(stagingRoot, sourcePath)), derivativeSha256: await hashFile(resolve(stagingRoot, derivativePath)) });
    }
    const inventory = createProductionInventory({ ...inventoryInput, media: inventoryMedia });
    await files.mkdir(resolve(stagingRoot, "config"), { recursive: true, mode: 0o700 });
    await files.writeFile(resolve(stagingRoot, "config/inventory.json"), JSON.stringify(inventory), { flag: "wx", mode: 0o600 });
    const manifest = await createManifest(stagingRoot, setId, now().toISOString());
    await files.writeFile(resolve(stagingRoot, "manifest.json"), JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
    await files.writeFile(resolve(stagingRoot, "COMPLETE"), JSON.stringify({ format: "blog-x-backup-complete", version: 1, manifestSha256: await hashFile(resolve(stagingRoot, "manifest.json")) }), { flag: "wx", mode: 0o600 });
    await Promise.all([fsync(resolve(stagingRoot, "manifest.json"), files), fsync(resolve(stagingRoot, "COMPLETE"), files)]);
    await verifyCompleteBackupSetContents(stagingRoot, (candidate) => validateProductionBackupStaging(candidate, policy.sourceAuthority));
    await files.rename(stagingRoot, finalRoot);
    const verified = await verifyProductionBackupSource(finalRoot, policy.sourceAuthority);
    return { setId, finalRoot, manifestSha256: verified.marker.manifestSha256, scope: policy.sourceAuthority.kind === "generated-test" ? "generated-production-pipeline" : "service-production-pipeline" };
  } finally {
    process.umask(priorUmask);
  }
}
