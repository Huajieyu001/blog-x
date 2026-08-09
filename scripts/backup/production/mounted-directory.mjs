import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

const profileId = "blog-x-mounted-directory-v1";
const setPattern = /^\d{8}T\d{6}Z-[a-z0-9]{8,32}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const generatedMountBasePattern = /^blog-x-production-mount-[A-Za-z0-9_-]{6,64}$/;

function fail(message) {
  throw new Error(`mounted destination ${message}`);
}

function strictObject(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function within(value, parent) {
  return value === parent || value.startsWith(`${parent}/`);
}

async function restrictive(path, expectedType, label) {
  let info;
  try { info = await lstat(path); } catch { fail(`${label} is missing`); }
  if ((expectedType === "directory" ? !info.isDirectory() : !info.isFile()) || info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail(`${label} is unsafe`);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) fail(`${label} ownership is invalid`);
  return info;
}

function parseDestination(value) {
  if (!strictObject(value, ["kind", "mountRoot", "profileId"]) || (value.kind !== "generated-test" && value.kind !== "service")
    || typeof value.mountRoot !== "string" || value.mountRoot.includes("${") || value.mountRoot.includes("..") || value.profileId !== profileId) fail("policy is invalid");
  const mountRoot = resolve(value.mountRoot);
  const workspace = resolve(process.cwd());
  if (mountRoot === "/" || within(mountRoot, workspace)) fail("root is broad");
  if (value.kind === "generated-test") {
    if (dirname(mountRoot) !== resolve(tmpdir()) || !generatedMountBasePattern.test(basename(mountRoot))) fail("generated root is invalid");
  } else if (mountRoot === resolve(tmpdir()) || within(mountRoot, resolve(tmpdir()))) {
    fail("service root is invalid");
  }
  return { kind: value.kind, mountRoot, profileId: value.profileId };
}

export async function validateMountedDestination(value, inspectMount) {
  if (typeof inspectMount !== "function") fail("inspection is required");
  const destination = parseDestination(value);
  await restrictive(destination.mountRoot, "directory", "root");
  const identityPath = resolve(destination.mountRoot, "identity.json");
  await restrictive(identityPath, "file", "identity sentinel");
  let identity;
  try { identity = JSON.parse(await readFile(identityPath, "utf8")); } catch { fail("identity sentinel is invalid"); }
  if (!strictObject(identity, ["format", "profileId", "version"]) || identity.format !== "blog-x-mounted-directory" || identity.version !== 1 || identity.profileId !== destination.profileId) fail("identity sentinel does not match profile");
  const inspected = await inspectMount(destination.mountRoot);
  if (!inspected || inspected.isMountPoint !== true || (typeof inspected.root === "string" && resolve(inspected.root) !== destination.mountRoot)) fail("is not the configured mountpoint");
  return destination;
}

async function fsync(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function fsyncDirectory(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

function receiptFor(value) {
  if (!strictObject(value, ["aadSha256", "ciphertextSha256", "createdAt", "destinationProfileId", "format", "manifestSha256", "setId", "version"])
    || value.format !== "blog-x-backup-receipt" || value.version !== 1 || !setPattern.test(value.setId ?? "") || value.destinationProfileId !== profileId
    || !Number.isFinite(Date.parse(value.createdAt)) || [value.aadSha256, value.ciphertextSha256, value.manifestSha256].some((item) => !digestPattern.test(item ?? ""))) fail("receipt is invalid");
  return value;
}

export async function createMountedDirectoryTransport(value, { inspectMount } = {}) {
  const destination = await validateMountedDestination(value, inspectMount);
  const objectsRoot = resolve(destination.mountRoot, "objects");
  return {
    scope: destination.kind === "generated-test" ? "generated-mounted-fixture" : "service-mounted-directory",
    destinationProfileId: destination.profileId,
    async transfer({ setId, ciphertext, ciphertextSha256, manifestSha256, aadSha256, createdAt }) {
      if (!setPattern.test(setId ?? "") || !Buffer.isBuffer(ciphertext) || ciphertext.length === 0 || [ciphertextSha256, manifestSha256, aadSha256].some((item) => !digestPattern.test(item ?? "")) || !Number.isFinite(Date.parse(createdAt))) fail("transfer input is invalid");
      if (createHash("sha256").update(ciphertext).digest("hex") !== ciphertextSha256) fail("local ciphertext digest mismatch");
      await mkdir(objectsRoot, { mode: 0o700 }).catch((error) => { if (error?.code !== "EEXIST") throw error; });
      await restrictive(objectsRoot, "directory", "objects prefix");
      const cipherPath = resolve(objectsRoot, `${setId}.aesgcm`);
      const receiptPath = resolve(objectsRoot, `${setId}.receipt.json`);
      const token = randomBytes(12).toString("hex");
      const cipherIncomplete = resolve(objectsRoot, `.${setId}.aesgcm.incomplete-${token}`);
      const receiptIncomplete = resolve(objectsRoot, `.${setId}.receipt.json.incomplete-${token}`);
      for (const path of [cipherPath, receiptPath, cipherIncomplete, receiptIncomplete]) await lstat(path).then(() => fail("object collision exists")).catch((error) => { if (error?.code !== "ENOENT") throw error; });
      await writeFile(cipherIncomplete, ciphertext, { flag: "wx", mode: 0o600 });
      await fsync(cipherIncomplete);
      const remoteDigest = createHash("sha256").update(await readFile(cipherIncomplete)).digest("hex");
      if (remoteDigest !== ciphertextSha256) fail("remote ciphertext digest mismatch");
      await rename(cipherIncomplete, cipherPath);
      await fsyncDirectory(objectsRoot);
      const receipt = receiptFor({ format: "blog-x-backup-receipt", version: 1, setId, manifestSha256, ciphertextSha256: remoteDigest, aadSha256, createdAt, destinationProfileId: destination.profileId });
      await writeFile(receiptIncomplete, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
      await fsync(receiptIncomplete);
      await rename(receiptIncomplete, receiptPath);
      await fsyncDirectory(objectsRoot);
      return { ...receipt, receiptSha256: createHash("sha256").update(JSON.stringify(receipt)).digest("hex") };
    },
    async catalog() {
      try { await restrictive(objectsRoot, "directory", "objects prefix"); } catch (error) { if (/is missing/.test(error.message)) return []; throw error; }
      const entries = await readdir(objectsRoot, { withFileTypes: true });
      const records = new Map();
      for (const entry of entries) {
        if (!entry.isFile()) fail("catalog contains a non-file");
        const cipher = /^(\d{8}T\d{6}Z-[a-z0-9]{8,32})\.aesgcm$/.exec(entry.name);
        const receipt = /^(\d{8}T\d{6}Z-[a-z0-9]{8,32})\.receipt\.json$/.exec(entry.name);
        if (!cipher && !receipt) fail("catalog contains an unexpected object");
        const setId = (cipher ?? receipt)[1];
        const record = records.get(setId) ?? {};
        if (cipher) record.cipherPath = resolve(objectsRoot, entry.name);
        if (receipt) record.receiptPath = resolve(objectsRoot, entry.name);
        records.set(setId, record);
      }
      const output = [];
      for (const [setId, record] of records) {
        if (!record.cipherPath || !record.receiptPath) fail("catalog receipt pair is incomplete");
        await Promise.all([restrictive(record.cipherPath, "file", "ciphertext"), restrictive(record.receiptPath, "file", "receipt")]);
        const receipt = receiptFor(JSON.parse(await readFile(record.receiptPath, "utf8")));
        if (receipt.setId !== setId || receipt.destinationProfileId !== destination.profileId) fail("catalog receipt identity mismatch");
        const ciphertextSha256 = createHash("sha256").update(await readFile(record.cipherPath)).digest("hex");
        if (ciphertextSha256 !== receipt.ciphertextSha256) fail("catalog ciphertext digest mismatch");
        output.push({ setId, cipherPath: record.cipherPath, receiptPath: record.receiptPath, receipt, receiptSha256: createHash("sha256").update(JSON.stringify(receipt)).digest("hex") });
      }
      return output.sort((left, right) => left.setId.localeCompare(right.setId));
    },
    async deleteCatalogEntry(entry) {
      if (!entry || !setPattern.test(entry.setId ?? "") || dirname(entry.cipherPath ?? "") !== objectsRoot || dirname(entry.receiptPath ?? "") !== objectsRoot) fail("deletion target is invalid");
      await Promise.all([unlink(entry.cipherPath), unlink(entry.receiptPath)]);
      await fsyncDirectory(objectsRoot);
    },
  };
}
