import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  createProductionLiveRefreshAdapter,
  createProductionRefreshAttemptStore,
  verifyProductionLiveRefreshEvidence,
} from "./refresh-local-live.mjs";
import {
  LOCAL_DELIVERY_FORMAT,
  LOCAL_DELIVERY_REFRESH_KIND,
  LOCAL_DELIVERY_VERSION,
  runRefreshCliBoundary,
} from "./refresh-local-runtime-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = resolve(root, "compose.yaml");
const lockfile = resolve(root, "pnpm-lock.yaml");
const REFRESH_ROOT = "/refresh-workspace";
const STORE_ROOT = "/pnpm-store";
const REQUIRED_LABELS = [
  "org.opencontainers.image.revision",
  "io.blog-x.lockfile-sha256",
  "io.blog-x.seed-image-id",
  "io.blog-x.application",
  "io.blog-x.public-origin",
  "io.blog-x.refresh-kind",
];

export const FIXED_REFRESH = Object.freeze({
  project: "blogxlocal",
  origin: "http://127.0.0.1:3100",
  services: ["api", "web"],
  volumes: ["blogxlocal_postgres-data", "blogxlocal_media-data"],
});

function fail(message) { throw new Error(`local refresh: ${message}`); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function shortRevision(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision)) fail("revision must be a clean full Git SHA");
  return revision.slice(0, 12);
}

export function createRefreshPlan({ revision, lockSha256, apiSeedId, webSeedId }) {
  const short = shortRevision(revision);
  if (!/^[a-f0-9]{64}$/.test(lockSha256)) fail("lock digest is invalid");
  if (![apiSeedId, webSeedId].every((value) => /^sha256:[a-f0-9]+$/.test(value))) fail("seed IDs must be immutable sha256 IDs");
  const target = (application, seedId) => ({
    application,
    seedId,
    tag: `blog-x-${application}-local:${short}`,
    dockerfile: `apps/${application}/Dockerfile.refresh`,
    labels: {
      "org.opencontainers.image.revision": revision,
      "io.blog-x.lockfile-sha256": lockSha256,
      "io.blog-x.seed-image-id": seedId,
      "io.blog-x.application": application,
      "io.blog-x.public-origin": FIXED_REFRESH.origin,
      "io.blog-x.refresh-kind": LOCAL_DELIVERY_REFRESH_KIND,
    },
  });
  return {
    revision,
    lockSha256,
    project: FIXED_REFRESH.project,
    targets: [target("api", apiSeedId), target("web", webSeedId)],
    phases: ["preflight", "seed-prerequisites", "build-api", "build-web", "inspect-target-images", "accept-v1.1", "migrate", "schema-verify", "cutover-api-web", "routes", "release-blocked", "write-evidence"],
    preMutation: [
      { args: ["git", "status", "--porcelain"], readOnly: true },
      { args: ["docker", "build", "--network=none", "--pull=false"] },
      { args: ["docker", "image", "inspect"], readOnly: true },
    ],
  };
}

export function inspectTargetFilesystem({ workdir, cmd, neutralStore, storePath, paths }) {
  if (workdir !== REFRESH_ROOT) fail("target working directory must be /refresh-workspace");
  if (storePath !== neutralStore || !/^\/pnpm-store\/v\d+$/.test(storePath)) fail("target pnpm store must resolve to the populated neutral version directory");
  if (!Array.isArray(cmd) || cmd.some((part) => String(part).includes("/workspace"))) fail("target command cannot use inherited workspace");
  if (!Array.isArray(paths) || paths.some((path) => path === "/workspace" || path.startsWith("/workspace/") || path.startsWith(`${STORE_ROOT}/files`) || /\/(?:node_modules|dist|\.next)(?:\/|$)/.test(path) && !path.startsWith(`${REFRESH_ROOT}/`))) {
    fail("target retains legacy workspace, flattened store, or legacy build output");
  }
  if (paths.some((path) => path.startsWith(`${REFRESH_ROOT}/`) && /\/(?:node_modules|dist)(?:\/|$)/.test(path))) fail("target contains legacy application output");
  return true;
}

export async function runLocalRefresh({ adapter, plan = createRefreshPlan({ revision: "0".repeat(40), lockSha256: "0".repeat(64), apiSeedId: "sha256:0", webSeedId: "sha256:0" }) } = {}) {
  if (!adapter?.execute) fail("a command adapter is required");
  let cutoverStarted = false; let attemptedPhase = "preflight";
  try {
    for (const phase of plan.phases) {
      if (phase === "write-evidence") continue;
      attemptedPhase = phase;
      if (phase === "cutover-api-web") cutoverStarted = true;
      await adapter.execute(phase, plan);
    }
    attemptedPhase = "write-evidence";
    await adapter.execute("write-evidence", plan);
    return { format: LOCAL_DELIVERY_FORMAT, version: LOCAL_DELIVERY_VERSION, implementationRevision: plan.revision, lockfileSha256: plan.lockSha256, releaseState: "BLOCKED" };
  } catch (error) {
    error.refreshStage ??= adapter.currentPhase?.() ?? attemptedPhase;
    if (cutoverStarted && !error.refreshBeforeMutation) {
      try {
        await adapter.execute("rollback-api-web", plan);
        await adapter.execute("verify-rollback", plan);
      } catch (recoveryError) {
        if (/^UNRECOVERABLE_EVIDENCE_INVARIANT:/.test(error?.message ?? "")) throw error;
        recoveryError.refreshStage ??= adapter.currentPhase?.() ?? "rollback-api-web";
        throw recoveryError;
      }
    }
    throw error;
  }
}

function run(command, args, { cwd = root, input, env } = {}) {
  const childEnv = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"].filter((key) => typeof process.env[key] === "string" && process.env[key]).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env ?? {})) {
    if (!["BLOG_X_API_IMAGE", "BLOG_X_WEB_IMAGE"].includes(key) || typeof value !== "string") fail("child environment addition is forbidden");
    childEnv[key] = value;
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: childEnv, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`${command} ${args.join(" ")} failed (${code}): ${stderr.trim()}`));
      else resolvePromise({ stdout, stderr });
    });
    if (input) child.stdin.end(input);
  });
}

async function inspectImage(reference) {
  const result = await run("docker", ["image", "inspect", reference]);
  const image = JSON.parse(result.stdout)[0];
  if (!image?.Id?.startsWith("sha256:")) fail(`cannot inspect immutable image ${reference}`);
  return image;
}

async function probeOne(application, seedImage, revision, lockSha256) {
  const unique = randomBytes(8).toString("hex");
  const tag = `blog-x-refresh-probe-${application}:${unique}`;
  const seed = await inspectImage(seedImage);
  const args = ["build", "--network=none", "--pull=false", "--file", `apps/${application}/Dockerfile.refresh`, "--tag", tag,
    "--build-arg", `SEED_IMAGE=${seedImage}`, "--build-arg", `SEED_IMAGE_ID=${seed.Id}`, "--build-arg", `REFRESH_REVISION=${revision}`, "--build-arg", `LOCKFILE_SHA256=${lockSha256}`, "--build-arg", `PUBLIC_ORIGIN=${FIXED_REFRESH.origin}`, "."];
  try {
    await run("docker", args);
    const image = await inspectImage(tag);
    const config = image.Config ?? {};
    const labels = config.Labels ?? {};
    for (const [key, value] of Object.entries({ "org.opencontainers.image.revision": revision, "io.blog-x.lockfile-sha256": lockSha256, "io.blog-x.seed-image-id": seed.Id, "io.blog-x.application": application, "io.blog-x.public-origin": FIXED_REFRESH.origin, "io.blog-x.refresh-kind": LOCAL_DELIVERY_REFRESH_KIND })) {
      if (labels[key] !== value) fail(`${application} probe label ${key} is not exact`);
    }
    const store = (await run("docker", ["run", "--rm", "--network=none", "--entrypoint", "corepack", tag, "pnpm", "--store-dir=/pnpm-store", "store", "path"])).stdout.trim();
    const appCheck = application === "web"
      ? "test -d /refresh-workspace/apps/web/.next && test ! -e /refresh-workspace/apps/web/dist"
      : "test -d /refresh-workspace/apps/api && test ! -e /refresh-workspace/apps/api/dist";
    const shellCheck = `test ! -e /workspace && test -d /refresh-workspace && test -d /pnpm-store && test ! -e /pnpm-store/files && ${appCheck}`;
    await run("docker", ["run", "--rm", "--network=none", "--entrypoint", "sh", tag, "-ec", shellCheck]);
    inspectTargetFilesystem({ workdir: config.WorkingDir, cmd: config.Cmd, neutralStore: store, storePath: store, paths: [`${REFRESH_ROOT}/apps/${application}`, `${store}/probe`] });
    return { tag, imageId: image.Id, store };
  } finally {
    await run("docker", ["image", "rm", tag]);
  }
}

export async function probeOfflineBuilds({ apiSeedImage = process.env.BLOG_X_API_SEED_IMAGE ?? "blog-x-api-local", webSeedImage = process.env.BLOG_X_WEB_SEED_IMAGE ?? "blog-x-web-local" } = {}) {
  const revision = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
  const lockSha256 = sha256(await readFile(lockfile));
  const api = await probeOne("api", apiSeedImage, revision, lockSha256);
  const web = await probeOne("web", webSeedImage, revision, lockSha256);
  return { api, web, revision, lockSha256 };
}

async function resolveCleanRevision() {
  const status = (await run("git", ["status", "--porcelain"])).stdout;
  if (status.trim()) fail("worktree must be clean before live refresh");
  const ref = (await run("git", ["symbolic-ref", "--quiet", "HEAD"])).stdout.trim();
  if (!/^refs\/heads\/[^\s\x00-\x1f]+$/.test(ref)) fail("worktree must be on a non-detached branch before live refresh");
  const revision = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
  shortRevision(revision);
  return revision;
}

export async function runRefreshCli(...args) {
  if (args.length) fail("sealed production refresh CLI accepts no arguments or overrides");
  return runRefreshCliBoundary({
    argv: process.argv.slice(2),
    resolveRevision: resolveCleanRevision,
    attemptStore: createProductionRefreshAttemptStore(),
    adapterFactory: createProductionLiveRefreshAdapter,
    output: process.stdout,
    readLockfile: () => readFile(lockfile),
    materializePlan: (bytes, revision) => createRefreshPlan({ revision, lockSha256: sha256(bytes), apiSeedId: "sha256:0", webSeedId: "sha256:0" }),
    executeRefresh: (adapter, plan) => runLocalRefresh({ adapter, plan }),
    verifyEvidence: verifyProductionLiveRefreshEvidence,
    probeOffline: probeOfflineBuilds,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRefreshCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
