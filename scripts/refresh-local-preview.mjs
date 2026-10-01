import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertLocalDockerAuthority,
  assertSeedPrerequisiteFacts,
  buildMinimalChildEnvironment,
} from "./refresh-local-runtime-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composePrefix = Object.freeze(["-p", "blogxlocal", "-f", "compose.yaml"]);
const origin = "http://127.0.0.1:3100";
const refreshKind = "v1.1-offline-local-delivery";
const applications = Object.freeze(["api", "web"]);
const canonicalContainers = Object.freeze({ api: "blogxlocal-api-1", web: "blogxlocal-web-1" });
const targetTags = Object.freeze({ api: "blog-x-api-preview:current", web: "blog-x-web-preview:current" });
const requiredTargetLabels = Object.freeze([
  "org.opencontainers.image.revision",
  "io.blog-x.lockfile-sha256",
  "io.blog-x.seed-image-id",
  "io.blog-x.application",
  "io.blog-x.public-origin",
  "io.blog-x.refresh-kind",
]);
const seedCacheProgram = "const fs=require('node:fs');const app=process.argv[1],store='/pnpm-store',entries=p=>fs.existsSync(p)&&fs.readdirSync(p).length>0,versions=fs.existsSync(store)&&fs.readdirSync(store);if(!Array.isArray(versions)||versions.length!==1||!/^v\\d+$/.test(versions[0])||!entries(store+'/'+versions[0])||!fs.existsSync('/refresh-workspace/apps/'+app)||!entries('/root/.cache/node/corepack')||!entries('/root/.cache/pnpm'))process.exit(42);";

export const FAST_LOCAL_PREVIEW_READY = "FAST LOCAL PREVIEW READY http://127.0.0.1:3100";

function fail(message) { throw new Error(`fast local preview: ${message}`); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function validImageId(value) { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function validRevision(value) { return typeof value === "string" && /^[a-f0-9]{40}$/.test(value); }

export function buildFastPreviewEnvironment(ambient = process.env, additions = {}) {
  return buildMinimalChildEnvironment(ambient, additions);
}

export function assertFastPreviewArgv(argv = process.argv) {
  if (!Array.isArray(argv) || argv.length !== 2) throw new Error("fast local preview accepts no arguments");
}

export function createFastPreviewPlan({ revision, lockfileSha256, seeds, targets } = {}) {
  if (!validRevision(revision) || !/^[a-f0-9]{64}$/.test(lockfileSha256)) fail("build metadata is invalid");
  if (!seeds || !targets || applications.some((app) => !validImageId(seeds[app]) || !validImageId(targets[app]))) fail("preview image plan is invalid");
  const build = (application) => Object.freeze({
    command: "docker",
    args: Object.freeze(["build", "--network=none", "--pull=false", "--file", `apps/${application}/Dockerfile.refresh`, "--tag", targetTags[application], "--build-arg", `SEED_IMAGE=${seeds[application]}`, "--build-arg", `SEED_IMAGE_ID=${seeds[application]}`, "--build-arg", `REFRESH_REVISION=${revision}`, "--build-arg", `LOCKFILE_SHA256=${lockfileSha256}`, "--build-arg", `PUBLIC_ORIGIN=${origin}`, "."]),
  });
  return Object.freeze({
    typecheck: Object.freeze({ command: "corepack", args: Object.freeze(["pnpm", "--config.offline=true", "-r", "run", "typecheck"]) }),
    builds: Object.freeze(applications.map(build)),
    cutover: Object.freeze({ command: "docker-compose", args: Object.freeze([...composePrefix, "up", "-d", "--wait", "--no-build", "--no-deps", "api", "web"]) }),
    smoke: Object.freeze({ command: "corepack", args: Object.freeze(["pnpm", "--config.offline=true", "exec", "playwright", "test", "--config=scripts/local-preview.playwright.config.ts", "scripts/local-preview-smoke.spec.ts", "--workers=1"]) }),
  });
}

function nativeRunCommand(command, args, { cwd, env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.once("error", (error) => reject(new Error(`fast local preview could not start ${command}: ${error.message}`)));
    child.once("close", (code, signal) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`fast local preview stage failed: ${command} ${args.join(" ")} (${signal ?? code ?? "unknown"})`));
    });
  });
}

function parseImage(stdout, reference) {
  let parsed;
  try { parsed = JSON.parse(String(stdout)); } catch { fail(`image inspect ${reference} returned invalid JSON`); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0] || typeof parsed[0] !== "object") fail(`image inspect ${reference} returned an invalid result`);
  return parsed[0];
}

function exactTargetLabels(image, { application, seedId, revision, lockfileSha256 }) {
  if (!validImageId(image?.Id) || image.Config?.WorkingDir !== "/refresh-workspace") fail(`${application} target image is not immutable refresh workspace output`);
  const labels = image.Config?.Labels;
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) fail(`${application} target labels are invalid`);
  const expected = {
    "org.opencontainers.image.revision": revision,
    "io.blog-x.lockfile-sha256": lockfileSha256,
    "io.blog-x.seed-image-id": seedId,
    "io.blog-x.application": application,
    "io.blog-x.public-origin": origin,
    "io.blog-x.refresh-kind": refreshKind,
  };
  if (Object.keys(labels).filter((key) => requiredTargetLabels.includes(key)).length !== requiredTargetLabels.length) fail(`${application} target labels are incomplete`);
  for (const [key, value] of Object.entries(expected)) if (labels[key] !== value) fail(`${application} target label ${key} is not exact`);
  return image.Id;
}

async function inspectImage(runCommand, reference, options) {
  return parseImage((await runCommand("docker", ["image", "inspect", reference], options)).stdout, reference);
}

async function inspectCanonicalContainers(runCommand, options) {
  let rows;
  try { rows = JSON.parse(String((await runCommand("docker", ["container", "inspect", ...applications.map((application) => canonicalContainers[application])], options)).stdout)); }
  catch { fail("canonical container inspect returned invalid JSON"); }
  if (!Array.isArray(rows) || rows.length !== applications.length) fail("canonical container inspect returned an invalid result");
  const byName = new Map(rows.map((row) => [row?.Name, row]));
  const seedIds = {};
  for (const application of applications) {
    const name = `/${canonicalContainers[application]}`;
    const container = byName.get(name);
    if (!container || container.Name !== name || container.State?.Running !== true || !validImageId(container.Image)) fail(`${application} canonical container is not running with an immutable image`);
    seedIds[application] = container.Image;
  }
  return Object.freeze(seedIds);
}

async function inspectSeedImages(runCommand, seedIds, options) {
  let rows;
  const references = applications.map((application) => seedIds[application]);
  try { rows = JSON.parse(String((await runCommand("docker", ["image", "inspect", ...references], options)).stdout)); }
  catch { fail("canonical seed image inspect returned invalid JSON"); }
  if (!Array.isArray(rows) || rows.length !== applications.length) fail("canonical seed image inspect returned an invalid result");
  const byId = new Map(rows.map((image) => [image?.Id, image]));
  const images = {};
  for (const application of applications) {
    const image = byId.get(seedIds[application]);
    if (!image || image.Id !== seedIds[application]) fail(`${application} canonical seed image drifted`);
    images[application] = image;
  }
  return Object.freeze(images);
}

async function validatePrerequisites({ runCommand, env, revision, lockfileSha256 }) {
  const options = { cwd: root, env };
  const context = String((await runCommand("docker", ["context", "show"], options)).stdout ?? "").trim();
  if (!context) fail("active Docker context is empty");
  let inspectedContext;
  try { inspectedContext = JSON.parse(String((await runCommand("docker", ["context", "inspect", context], options)).stdout)); }
  catch { fail("active Docker context returned invalid JSON"); }
  assertLocalDockerAuthority(context, inspectedContext, { home: env.HOME });
  const base = await inspectImage(runCommand, "node:24.15.0-alpine", options);
  if (!validImageId(base.Id)) fail("local Node base image is missing or mutable");
  const seedIds = await inspectCanonicalContainers(runCommand, options);
  const images = await inspectSeedImages(runCommand, seedIds, options);
  for (const application of applications) {
    const image = images[application];
    assertSeedPrerequisiteFacts({ application, expectedId: seedIds[application], image, lockfileSha256 });
    await runCommand("docker", ["run", "--rm", "--network=none", "--entrypoint", "node", image.Id, "-e", seedCacheProgram, application], options);
  }
  if (!validRevision(revision)) fail("Git HEAD is not a full immutable revision");
  return Object.freeze(Object.fromEntries(applications.map((application) => [application, images[application].Id])));
}

export async function runFastLocalPreview({ ambientEnv = process.env, readLockfile = () => readFile(resolve(root, "pnpm-lock.yaml")), runCommand = nativeRunCommand, write = (line) => process.stdout.write(line) } = {}) {
  if (typeof runCommand !== "function" || typeof readLockfile !== "function" || typeof write !== "function") throw new Error("fast local preview runner is invalid");
  const env = buildFastPreviewEnvironment(ambientEnv);
  const options = { cwd: root, env };
  const revision = String((await runCommand("git", ["rev-parse", "HEAD"], options)).stdout ?? "").trim();
  const lockfileSha256 = sha256(await readLockfile());
  const seeds = await validatePrerequisites({ runCommand, env, revision, lockfileSha256 });
  const provisionalTargets = Object.freeze({ api: seeds.api, web: seeds.web });
  const plan = createFastPreviewPlan({ revision, lockfileSha256, seeds, targets: provisionalTargets });
  await runCommand(plan.typecheck.command, plan.typecheck.args, options);
  for (const build of plan.builds) await runCommand(build.command, build.args, options);
  const targets = {};
  for (const application of applications) {
    const image = await inspectImage(runCommand, targetTags[application], options);
    targets[application] = exactTargetLabels(image, { application, seedId: seeds[application], revision, lockfileSha256 });
  }
  const cutoverEnv = buildFastPreviewEnvironment(ambientEnv, { BLOG_X_API_IMAGE: targets.api, BLOG_X_WEB_IMAGE: targets.web });
  await runCommand(plan.cutover.command, plan.cutover.args, { cwd: root, env: cutoverEnv });
  await runCommand(plan.smoke.command, plan.smoke.args, options);
  write(`${FAST_LOCAL_PREVIEW_READY}\n`);
}

async function main() {
  assertFastPreviewArgv();
  await runFastLocalPreview();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
