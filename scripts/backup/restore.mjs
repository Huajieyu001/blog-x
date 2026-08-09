import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { verifyBackupSet } from "./manifest.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = resolve(repositoryRoot, "compose.yaml");
const namespacePattern = /^blogxrestore_([a-z0-9]{8,32})$/;
const restoreRootPattern = /^blog-x-restore-verify-[A-Za-z0-9_-]{6,64}$/;

export function validateRestoreNamespace(value) {
  if (!namespacePattern.test(value ?? "")) throw new Error("restore namespace must match blogxrestore_[a-z0-9]{8,32}");
  return value;
}

export function validateRestoreDatabase(value, namespace) {
  const match = namespacePattern.exec(validateRestoreNamespace(namespace));
  if (value !== `blog_x_restore_${match[1]}`) throw new Error("restore database must exactly match its generated namespace");
  return value;
}

export function validateRestoreMediaVolume(value, namespace) {
  validateRestoreNamespace(namespace);
  if (value !== `${namespace}_media-data`) throw new Error("restore media volume must exactly match its generated namespace");
  return value;
}

export function validateRestoreWebOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("restore Web origin must be an absolute loopback HTTP origin"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !url.port) {
    throw new Error("restore Web origin must be an absolute loopback HTTP origin with an explicit port");
  }
  return url.origin;
}

export function validateRestoreRoot(value) {
  if (typeof value !== "string" || !value || value.includes("${") || value.includes("..")) throw new Error("restore root is unresolved or broad");
  const target = resolve(value);
  if (dirname(target) !== resolve(tmpdir()) || !restoreRootPattern.test(basename(target))) throw new Error("restore root must be an exact generated temporary directory");
  return target;
}

export async function cleanupGeneratedRestoreRoot(value) {
  const target = validateRestoreRoot(value);
  const info = await lstat(target).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (info?.isSymbolicLink()) throw new Error("restore root cleanup target must not be a link");
  await rm(target, { recursive: true, force: true });
  return true;
}

function command(name, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(name, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      stdio: [options.inputPath ? "pipe" : "ignore", "pipe", "pipe"],
    });
    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code: code ?? 1, stdout: Buffer.concat(stdout), stderr };
      if (result.code === 0 || options.allowFailure) accept(result);
      else reject(new Error(`${name} restore command failed`));
    });
    if (options.inputPath) {
      const input = createReadStream(options.inputPath);
      input.on("error", reject);
      input.pipe(child.stdin);
    }
  });
}

function restoreEnvironment(plan, supplied = process.env) {
  return {
    ...supplied,
    BLOG_X_API_IMAGE: supplied.BLOG_X_API_IMAGE ?? "blog-x-api-verify:phase2",
    BLOG_X_WEB_IMAGE: supplied.BLOG_X_WEB_IMAGE ?? "blog-x-web-verify:phase2",
    BLOG_X_POSTGRES_DB: plan.database,
    BLOG_X_POSTGRES_USER: "blog_x",
    BLOG_X_WEB_PORT: String(new URL(plan.webOrigin).port),
    BLOG_X_PUBLIC_ORIGIN: plan.webOrigin,
  };
}

function composeArgs(plan, ...args) {
  return ["-p", plan.namespace, "-f", composeFile, ...args];
}

async function defaultInspectTarget(plan, dependencies) {
  const run = dependencies.run ?? command;
  const env = restoreEnvironment(plan, dependencies.env);
  const rootInfo = await lstat(plan.restoreRoot).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  const rootEntries = rootInfo?.isDirectory() && !rootInfo.isSymbolicLink() ? await readdir(plan.restoreRoot) : [];
  const project = await run("docker-compose", composeArgs(plan, "ps", "-aq"), { env, allowFailure: true });
  const mediaVolume = await run("docker", ["volume", "inspect", plan.mediaVolume], { env, allowFailure: true });
  return {
    namespaceExists: project.code === 0 && project.stdout.toString().trim().length > 0,
    databaseExists: project.code === 0 && project.stdout.toString().trim().length > 0,
    mediaVolumeExists: mediaVolume.code === 0,
    rootExists: Boolean(rootInfo), rootIsLink: Boolean(rootInfo?.isSymbolicLink()), rootEntries,
  };
}

function assertEmptyTarget(state) {
  if (!state || typeof state !== "object") throw new Error("restore target inspection is unavailable");
  if (state.rootIsLink) throw new Error("restore target root is a link");
  if (state.namespaceExists) throw new Error("restore namespace is active or already exists");
  if (state.databaseExists) throw new Error("restore database already exists");
  if (state.mediaVolumeExists) throw new Error("restore media volume already exists");
  if (state.rootExists && (!Array.isArray(state.rootEntries) || state.rootEntries.length)) throw new Error("restore root must be empty");
}

export async function preflightRestore(input, dependencies = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("restore input is invalid");
  const namespace = validateRestoreNamespace(input.namespace);
  const plan = {
    backupRoot: resolve(input.backupRoot ?? ""),
    restoreRoot: validateRestoreRoot(input.restoreRoot),
    namespace,
    database: validateRestoreDatabase(input.database, namespace),
    mediaVolume: validateRestoreMediaVolume(input.mediaVolume, namespace),
    webOrigin: validateRestoreWebOrigin(input.webOrigin),
  };
  const verified = await verifyBackupSet(plan.backupRoot);
  const inspectTarget = dependencies.inspectTarget ?? ((selected) => defaultInspectTarget(selected, dependencies));
  assertEmptyTarget(await inspectTarget(Object.freeze({ ...plan })));
  return Object.freeze({ ...plan, manifest: verified.manifest, inventory: verified.inventory });
}

async function defaultMutate(plan, dependencies) {
  const run = dependencies.run ?? command;
  const env = restoreEnvironment(plan, dependencies.env);
  const compose = (...args) => run("docker-compose", composeArgs(plan, ...args), { env });
  await mkdir(plan.restoreRoot, { recursive: true, mode: 0o700 });
  await compose("up", "-d", "--wait", "postgres");
  await run("docker-compose", composeArgs(plan, "exec", "-T", "postgres", "pg_restore", "-U", "blog_x", "-d", plan.database, "--exit-on-error", "--no-owner", "--no-privileges"), {
    env, inputPath: resolve(plan.backupRoot, "database.dump"),
  });
  const databaseUrl = `postgres://blog_x@postgres:5432/${plan.database}`;
  await compose("run", "--rm", "-T", "-e", `DATABASE_URL=${databaseUrl}`, "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:migrate");
  await compose("up", "-d", "--wait", "api");
  const api = await compose("ps", "-q", "api");
  const containerId = api.stdout.toString().trim();
  if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("restore API container is unavailable");
  await run("docker", ["cp", `${resolve(plan.backupRoot, "media")}/.`, `${containerId}:/var/lib/blog-x/media`], { env });
  await compose("exec", "-T", "-e", `DATABASE_URL=${databaseUrl}`, "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:schema:verify");
  await compose("up", "-d", "--wait", "web");
  return { restored: true };
}

export async function restoreBackupSet(input, dependencies = {}) {
  const plan = await preflightRestore(input, dependencies);
  const mutate = dependencies.mutate ?? ((selected) => defaultMutate(selected, dependencies));
  const result = await mutate(plan);
  return { ...result, plan, message: `RESTORE READY ${plan.namespace}` };
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  restoreBackupSet({
    backupRoot: option("backup-root"), restoreRoot: option("restore-root"), namespace: option("namespace"),
    database: option("database"), mediaVolume: option("media-volume"), webOrigin: option("web-origin"),
  }).then((result) => process.stdout.write(`${result.message}\n`)).catch((error) => {
    process.stderr.write(`RESTORE FAILED ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
