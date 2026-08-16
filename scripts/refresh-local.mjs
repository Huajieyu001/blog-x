import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

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
      "io.blog-x.refresh-kind": "phase6-offline",
    },
  });
  return {
    revision,
    lockSha256,
    project: FIXED_REFRESH.project,
    targets: [target("api", apiSeedId), target("web", webSeedId)],
    phases: ["preflight", "build-api", "build-web", "inspect-target-images", "migrate", "schema-verify", "cutover-api-web", "routes", "release-blocked", "write-evidence"],
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
  let cutoverStarted = false;
  try {
    for (const phase of plan.phases) {
      if (phase === "write-evidence") continue;
      if (phase === "cutover-api-web") cutoverStarted = true;
      await adapter.execute(phase, plan);
    }
    await adapter.execute("write-evidence", plan);
    return { format: "blog-x-phase6-local-refresh-evidence", version: 1, implementationRevision: plan.revision, lockfileSha256: plan.lockSha256, releaseState: "BLOCKED" };
  } catch (error) {
    if (cutoverStarted) {
      await adapter.execute("rollback-api-web", plan);
      await adapter.execute("verify-rollback", plan);
    }
    throw error;
  }
}

function run(command, args, { cwd = root, input } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
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
    for (const [key, value] of Object.entries({ "org.opencontainers.image.revision": revision, "io.blog-x.lockfile-sha256": lockSha256, "io.blog-x.seed-image-id": seed.Id, "io.blog-x.application": application, "io.blog-x.public-origin": FIXED_REFRESH.origin, "io.blog-x.refresh-kind": "phase6-offline" })) {
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
    await run("docker", ["image", "rm", tag]).catch(() => undefined);
  }
}

export async function probeOfflineBuilds({ apiSeedImage = process.env.BLOG_X_API_SEED_IMAGE ?? "blog-x-api-local", webSeedImage = process.env.BLOG_X_WEB_SEED_IMAGE ?? "blog-x-web-local" } = {}) {
  const revision = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
  const lockSha256 = sha256(await readFile(lockfile));
  const api = await probeOne("api", apiSeedImage, revision, lockSha256);
  const web = await probeOne("web", webSeedImage, revision, lockSha256);
  return { api, web, revision, lockSha256 };
}

export async function verifyEvidence(path) {
  const bytes = await readFile(resolve(root, path));
  const evidence = JSON.parse(bytes.toString("utf8"));
  if (evidence.format !== "blog-x-phase6-local-refresh-evidence" || evidence.version !== 1 || evidence.releaseState !== "BLOCKED") fail("evidence is not a strict blocked local refresh record");
  if (!/^[a-f0-9]{40}$/.test(evidence.implementationRevision ?? "") || !/^[a-f0-9]{64}$/.test(evidence.lockfileSha256 ?? "")) fail("evidence provenance is malformed");
  return evidence;
}

async function main() {
  const evidenceOption = process.argv.find((item) => item.startsWith("--verify-evidence="));
  if (evidenceOption) {
    await verifyEvidence(evidenceOption.slice("--verify-evidence=".length));
    process.stdout.write("LOCAL REFRESH EVIDENCE VERIFIED; RELEASE BLOCKED\n");
    return;
  }
  if (process.argv.includes("--probe-offline-builds")) {
    const result = await probeOfflineBuilds();
    process.stdout.write(`OFFLINE REFRESH PROBES PASSED ${result.revision.slice(0, 12)}\n`);
    return;
  }
  fail("live fixed refresh is intentionally available only to the ordered 06-05 executor");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
