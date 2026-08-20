import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readdir, readFile, readlink, rm } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const NEUTRAL_ROOT = "/pnpm-store";
const VERSION_DIRECTORY = /^v\d+$/;

function isBelow(child, parent) {
  const result = relative(parent, child);
  return result !== "" && !result.startsWith(`..${sep}`) && result !== ".." && !result.includes(`${sep}..${sep}`);
}

function fail(message) {
  throw new Error(`refresh seed store: ${message}`);
}

export function validateStorePaths({ sourceStore, neutralStore, neutralRoot = NEUTRAL_ROOT }) {
  if (![sourceStore, neutralStore, neutralRoot].every((value) => typeof value === "string" && isAbsolute(value))) fail("store paths must be absolute");
  const source = resolve(sourceStore);
  const neutral = resolve(neutralStore);
  const root = resolve(neutralRoot);
  if ([source, neutral, root].some((value) => value === resolve("/"))) fail("store path cannot be root");
  if (!VERSION_DIRECTORY.test(basename(source)) || basename(source) !== basename(neutral)) fail("store paths must use the same pnpm version directory");
  if (!isBelow(neutral, root)) fail("neutral store must be strictly below /pnpm-store");
  return { sourceStore: source, neutralStore: neutral, neutralRoot: root, alreadyNeutral: source === neutral };
}

export async function createStoreManifest(root) {
  const entries = [];
  async function visit(directory, prefix = "") {
    const names = (await readdir(directory)).sort();
    for (const name of names) {
      const absolute = resolve(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const details = await lstat(absolute);
      if (details.isDirectory()) {
        entries.push({ path: relativePath, type: "directory" });
        await visit(absolute, relativePath);
      } else if (details.isSymbolicLink()) {
        entries.push({ path: relativePath, type: "symlink", target: await readlink(absolute) });
      } else if (details.isFile()) {
        const bytes = await readFile(absolute);
        entries.push({ path: relativePath, type: "file", size: details.size, sha256: createHash("sha256").update(bytes).digest("hex") });
      } else {
        fail(`unsupported store entry ${relativePath}`);
      }
    }
  }
  const details = await lstat(root).catch(() => undefined);
  if (!details?.isDirectory()) fail("source store must exist as a directory");
  await visit(root);
  return entries;
}

export async function spawnForStdout(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
      else resolvePromise({ stdout, stderr });
    });
  });
}

export async function prepareSeedStore({ cwd = process.cwd(), run = spawnForStdout, copy = cp, neutralRoot = NEUTRAL_ROOT, refreshWorkspace = "/refresh-workspace" } = {}) {
  const sourceResult = await run("corepack", ["pnpm", "store", "path"], { cwd });
  const neutralResult = await run("corepack", ["pnpm", "--store-dir=/pnpm-store", "store", "path"], { cwd });
  const sourceStore = sourceResult.stdout.trim();
  const neutralStore = neutralResult.stdout.trim();
  const paths = validateStorePaths({ sourceStore, neutralStore, neutralRoot });
  const sourceManifest = await createStoreManifest(paths.sourceStore);
  if (paths.alreadyNeutral && sourceManifest.length === 0) fail("already-neutral store must not be empty");
  let neutralManifest = sourceManifest;
  if (!paths.alreadyNeutral) {
    await mkdir(paths.neutralStore, { recursive: true });
    await copy(paths.sourceStore, paths.neutralStore, { recursive: true, force: true, errorOnExist: false, verbatimSymlinks: true });
    neutralManifest = await createStoreManifest(paths.neutralStore);
    if (JSON.stringify(sourceManifest) !== JSON.stringify(neutralManifest)) fail("copied store manifest does not match source");
  }

  // The copy is verified before any inherited application or source-store tree is removed.
  if (!paths.alreadyNeutral) await rm(paths.sourceStore, { recursive: true, force: true });
  await rm(cwd === "/workspace" ? "/workspace" : resolve(cwd, "workspace"), { recursive: true, force: true });
  await rm(refreshWorkspace, { recursive: true, force: true });
  await mkdir(refreshWorkspace, { recursive: true });
  return { ...paths, manifest: neutralManifest, removedWorkspace: true };
}

async function main() {
  await prepareSeedStore();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
