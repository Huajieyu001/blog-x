import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceArchiveName = "hexo-source-20260805.tar.gz";
const publishedArchiveName = "hexo-published-20260805.tar.gz";
const checksumName = "SHA256SUMS";
const outputFiles = ["SHA256SUMS", "hexo-content.tar.gz", "manifest.json"];
const setIdPattern = /^\d{8}T\d{6}Z-[a-f0-9]{8}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const sourcePrefix = "myBlog/source/";

function fail(message) {
  throw new Error(message);
}

function command(name, args, options = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(name, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => reject(new Error(`cannot run ${name}: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) return resolveCommand(Buffer.concat(stdout).toString("utf8"));
      const detail = Buffer.concat(stderr).toString("utf8").trim().slice(0, 240);
      reject(new Error(`${name} failed${detail ? `: ${detail}` : ""}`));
    });
  });
}

async function hashFile(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

async function regularFile(path, label) {
  const info = await lstat(path).catch(() => fail(`${label} is missing`));
  if (info.isSymbolicLink() || !info.isFile()) fail(`${label} must be a non-linked regular file`);
  return info;
}

async function regularDirectory(path, label) {
  const info = await lstat(path).catch(() => fail(`${label} is missing`));
  if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} must be a non-linked directory`);
  return info;
}

function assertSetId(setId) {
  if (!setIdPattern.test(setId ?? "")) fail("backup set id is invalid");
  return setId;
}

function assertSafeArchivePath(path) {
  if (typeof path !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path) || path.startsWith("/") || path.includes("\\")) fail("archive member path is unsafe");
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  if (!normalized || normalized.split("/").some((part) => part === "." || part === ".." || !part)) fail("archive member path is unsafe");
  return path;
}

function assertSourceMember(path, isDirectory = false) {
  assertSafeArchivePath(path);
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  if (normalized !== "myBlog/source" && !normalized.startsWith(sourcePrefix)) fail("archive member is outside myBlog/source");
  if (!isDirectory && normalized === "myBlog/source") fail("archive payload is empty");
  return normalized;
}

function strictObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) fail(`${label} is invalid`);
  return value;
}

function parseChecksumFile(text, expectedNames) {
  if (!text.endsWith("\n")) fail("checksum authority is malformed");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== expectedNames.length || lines.some((line) => !line)) fail("checksum authority is malformed");
  const entries = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    if (!match || entries.has(match[2]) || !expectedNames.includes(match[2])) fail("checksum authority is malformed");
    entries.set(match[2], match[1]);
  }
  if (entries.size !== expectedNames.length || expectedNames.some((name) => !entries.has(name))) fail("checksum authority is malformed");
  return entries;
}

function pathsFor(options = {}) {
  const root = resolve(options.repositoryRoot ?? repositoryRoot);
  const backups = resolve(root, "backups");
  const sourceArchive = resolve(options.sourceArchive ?? join(backups, sourceArchiveName));
  const publishedArchive = resolve(options.publishedArchive ?? join(backups, publishedArchiveName));
  const checksumAuthority = resolve(options.checksumAuthority ?? join(backups, checksumName));
  const migrationRoot = resolve(root, "backups", "hexo-migration");
  for (const path of [sourceArchive, publishedArchive, checksumAuthority, migrationRoot]) {
    if (path !== root && !path.startsWith(`${root}${sep}`)) fail("backup path is outside repository root");
  }
  if (basename(sourceArchive) !== sourceArchiveName || basename(publishedArchive) !== publishedArchiveName || basename(checksumAuthority) !== checksumName) fail("backup provenance inputs are invalid");
  return { root, backups, sourceArchive, publishedArchive, checksumAuthority, migrationRoot };
}

async function verifySourceProvenance(paths) {
  await regularDirectory(paths.backups, "backups directory");
  const authority = parseChecksumFile(await readFile(paths.checksumAuthority, "utf8").catch(() => fail("checksum authority is missing")), [sourceArchiveName, publishedArchiveName]);
  const sources = [];
  for (const [name, path] of [[sourceArchiveName, paths.sourceArchive], [publishedArchiveName, paths.publishedArchive]]) {
    const info = await regularFile(path, name);
    const sha256 = await hashFile(path);
    if (authority.get(name) !== sha256) fail(`${name} checksum mismatch`);
    sources.push({ path: `backups/${name}`, bytes: info.size, sha256 });
  }
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

async function listTar(archive) {
  const names = (await command("tar", ["-tzf", archive])).split("\n").filter(Boolean);
  const verbose = (await command("tar", ["-tvzf", archive])).split("\n").filter(Boolean);
  if (!names.length || names.length !== verbose.length) fail("archive inventory is malformed");
  return names.map((name, index) => {
    assertSafeArchivePath(name);
    const type = verbose[index][0];
    if (!"-d".includes(type)) fail("archive member type is unsupported");
    return { path: name, type, isDirectory: type === "d" };
  });
}

async function removeGeneratedTemporary(path, prefix) {
  const target = resolve(path);
  const expectedParent = resolve(tmpdir());
  if (dirname(target) !== expectedParent || !basename(target).startsWith(prefix)) fail("refusing to remove unsafe temporary path");
  await rm(target, { recursive: true, force: true });
}

async function listRegularFiles(root, directory = root) {
  const members = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    const member = relative(root, full).split(sep).join("/");
    const info = await lstat(full);
    if (info.isSymbolicLink()) fail(`backup member is a link: ${member}`);
    if (info.isDirectory()) members.push(...await listRegularFiles(root, full));
    else if (info.isFile()) members.push({ path: member, bytes: info.size, sha256: await hashFile(full) });
    else fail(`backup member type is unsupported: ${member}`);
  }
  return members.sort((left, right) => left.path.localeCompare(right.path));
}

async function archiveInventory(archive, extractPrefix) {
  const entries = await listTar(archive);
  for (const entry of entries) assertSourceMember(entry.path, entry.isDirectory);
  const temporary = await mkdtemp(join(tmpdir(), extractPrefix));
  await chmod(temporary, 0o700);
  try {
    await command("tar", ["-xzf", archive, "-C", temporary, "myBlog/source"]);
    const sourceRoot = resolve(temporary, "myBlog", "source");
    await regularDirectory(sourceRoot, "extracted Hexo source");
    const members = await listRegularFiles(resolve(temporary));
    if (!members.length || members.some((member) => !member.path.startsWith(sourcePrefix))) fail("archive payload is invalid");
    return members;
  } finally {
    await removeGeneratedTemporary(temporary, extractPrefix);
  }
}

function parseManifest(text) {
  const manifest = JSON.parse(text);
  strictObject(manifest, ["contentArchive", "createdAt", "format", "members", "setId", "sourceArchives", "version"], "manifest");
  if (manifest.format !== "blog-x-hexo-content-backup" || manifest.version !== 1 || !setIdPattern.test(manifest.setId) || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.sourceArchives) || manifest.sourceArchives.length !== 2 || !Array.isArray(manifest.members) || !manifest.members.length) fail("manifest format is unsupported");
  strictObject(manifest.contentArchive, ["bytes", "path", "sha256"], "content archive");
  if (manifest.contentArchive.path !== "hexo-content.tar.gz" || !Number.isSafeInteger(manifest.contentArchive.bytes) || manifest.contentArchive.bytes <= 0 || !digestPattern.test(manifest.contentArchive.sha256)) fail("content archive is invalid");
  const expectedSources = [`backups/${sourceArchiveName}`, `backups/${publishedArchiveName}`];
  let previousSource = "";
  for (const source of manifest.sourceArchives) {
    strictObject(source, ["bytes", "path", "sha256"], "source archive");
    if (!expectedSources.includes(source.path) || source.path <= previousSource || !Number.isSafeInteger(source.bytes) || source.bytes <= 0 || !digestPattern.test(source.sha256)) fail("source archive is invalid");
    previousSource = source.path;
  }
  let previous = "";
  const seen = new Set();
  for (const member of manifest.members) {
    strictObject(member, ["bytes", "path", "sha256"], "manifest member");
    assertSourceMember(member.path);
    if (member.path <= previous || seen.has(member.path) || !Number.isSafeInteger(member.bytes) || member.bytes < 0 || !digestPattern.test(member.sha256)) fail("manifest member is invalid");
    seen.add(member.path); previous = member.path;
  }
  return manifest;
}

function compareMembers(expected, actual) {
  if (expected.length !== actual.length) fail("archive member count mismatch");
  for (let index = 0; index < expected.length; index += 1) {
    if (JSON.stringify(expected[index]) !== JSON.stringify(actual[index])) fail(`archive member mismatch: ${expected[index]?.path ?? "unknown"}`);
  }
}

async function ensureMigrationRoot(root) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  await regularDirectory(root, "migration backup root");
}

async function verifyAt(paths, setId, directoryOverride = undefined) {
  assertSetId(setId);
  await ensureMigrationRoot(paths.migrationRoot);
  const directory = resolve(directoryOverride ?? resolve(paths.migrationRoot, setId));
  if (dirname(directory) !== paths.migrationRoot) fail("backup output path is unsafe");
  if (directoryOverride && !new RegExp(`^\\.${setId}\\.incomplete-[a-f0-9]{12}$`).test(basename(directory))) fail("backup staging path is unsafe");
  await regularDirectory(directory, "backup set");
  const entries = await readdir(directory);
  if (JSON.stringify(entries.sort()) !== JSON.stringify(outputFiles)) fail("backup set must contain exactly three files");
  for (const file of outputFiles) await regularFile(resolve(directory, file), `backup ${file}`);
  const manifestPath = resolve(directory, "manifest.json");
  const archivePath = resolve(directory, "hexo-content.tar.gz");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = parseManifest(manifestText);
  if (manifest.setId !== setId) fail("manifest set ID mismatch");
  const sources = await verifySourceProvenance(paths);
  if (JSON.stringify(manifest.sourceArchives) !== JSON.stringify(sources)) fail("manifest source provenance mismatch");
  const archiveInfo = await stat(archivePath);
  const archiveSha256 = await hashFile(archivePath);
  if (archiveInfo.size !== manifest.contentArchive.bytes || archiveSha256 !== manifest.contentArchive.sha256) fail("content archive checksum mismatch");
  const checksums = parseChecksumFile(await readFile(resolve(directory, "SHA256SUMS"), "utf8"), ["hexo-content.tar.gz", "manifest.json"]);
  if (checksums.get("hexo-content.tar.gz") !== archiveSha256 || checksums.get("manifest.json") !== await hashFile(manifestPath)) fail("backup checksum file mismatch");
  compareMembers(manifest.members, await archiveInventory(archivePath, "blog-x-hexo-verify-"));
  return { setId, directory, manifest };
}

export async function createHexoContentBackup(options = {}) {
  const paths = pathsFor(options);
  const setId = assertSetId(options.setId ?? `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}-${randomBytes(4).toString("hex")}`);
  const priorUmask = process.umask(0o077);
  let staging = null;
  try {
    const sources = await verifySourceProvenance(paths);
    await ensureMigrationRoot(paths.migrationRoot);
    const finalRoot = resolve(paths.migrationRoot, setId);
    if (dirname(finalRoot) !== paths.migrationRoot) fail("backup output path is unsafe");
    if (await lstat(finalRoot).then(() => true).catch((error) => error.code === "ENOENT" ? false : Promise.reject(error))) fail("backup final collision exists");
    staging = resolve(paths.migrationRoot, `.${setId}.incomplete-${randomBytes(6).toString("hex")}`);
    await mkdir(staging, { mode: 0o700 });
    await chmod(staging, 0o700);
    const extracted = await mkdtemp(join(tmpdir(), "blog-x-hexo-create-"));
    await chmod(extracted, 0o700);
    try {
      const entries = await listTar(paths.sourceArchive);
      for (const entry of entries) assertSafeArchivePath(entry.path);
      if (!entries.some((entry) => !entry.isDirectory && entry.path.startsWith(sourcePrefix))) fail("Hexo source archive contains no content files");
      await command("tar", ["-xzf", paths.sourceArchive, "-C", extracted, "myBlog/source"]);
      const extractedSource = resolve(extracted, "myBlog", "source");
      await regularDirectory(extractedSource, "extracted Hexo source");
      const members = await listRegularFiles(resolve(extracted));
      if (!members.length || members.some((member) => !member.path.startsWith(sourcePrefix))) fail("Hexo source payload is invalid");
      const archivePath = resolve(staging, "hexo-content.tar.gz");
      await command("tar", ["-czf", archivePath, "-C", extracted, "myBlog/source"]);
      await chmod(archivePath, 0o600);
      const archiveInfo = await regularFile(archivePath, "content archive");
      const contentArchive = { path: "hexo-content.tar.gz", bytes: archiveInfo.size, sha256: await hashFile(archivePath) };
      const manifest = {
        format: "blog-x-hexo-content-backup", version: 1, setId,
        createdAt: (options.now?.() ?? new Date()).toISOString(), sourceArchives: sources, contentArchive, members,
      };
      const manifestPath = resolve(staging, "manifest.json");
      await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, { flag: "wx", mode: 0o600 });
      const sums = `${contentArchive.sha256}  hexo-content.tar.gz\n${await hashFile(manifestPath)}  manifest.json\n`;
      await writeFile(resolve(staging, "SHA256SUMS"), sums, { flag: "wx", mode: 0o600 });
    } finally {
      await removeGeneratedTemporary(extracted, "blog-x-hexo-create-");
    }
    await verifyAt(paths, setId, staging);
    await rename(staging, finalRoot);
    staging = null;
    await verifyAt(paths, setId);
    const after = await verifySourceProvenance(paths);
    if (JSON.stringify(after) !== JSON.stringify(sources)) fail("source archives changed during backup");
    return { setId, directory: finalRoot };
  } finally {
    process.umask(priorUmask);
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function verifyHexoContentBackup(options = {}) {
  const paths = pathsFor(options);
  const setId = assertSetId(options.setId);
  return verifyAt(paths, setId);
}

export function parseHexoBackupArguments(argv) {
  if (argv[0] === "--") argv = argv.slice(1);
  if (!argv.length) return { mode: "create" };
  if (argv.length !== 1) fail("backup arguments are invalid");
  if (argv[0].startsWith("--set-id=")) return { mode: "create", setId: assertSetId(argv[0].slice("--set-id=".length)) };
  if (argv[0].startsWith("--verify-set=")) return { mode: "verify", setId: assertSetId(argv[0].slice("--verify-set=".length)) };
  fail("backup arguments are invalid");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  Promise.resolve().then(async () => {
    const input = parseHexoBackupArguments(process.argv.slice(2));
    const result = input.mode === "create" ? await createHexoContentBackup(input) : await verifyHexoContentBackup(input);
    process.stdout.write(`${input.mode === "create" ? "HEXO BACKUP COMPLETE" : "HEXO BACKUP VERIFIED"} ${result.setId}\n`);
  }).catch((error) => {
    process.stderr.write(`HEXO BACKUP FAILED ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
