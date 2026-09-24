import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { LOCAL_DELIVERY_REFRESH_KIND } from "../refresh-local-runtime-core.mjs";

const execFileAsync = promisify(execFile);
const imageIdPattern = /^sha256:[a-f0-9]{64}$/;
const containerIdPattern = /^[a-f0-9]{64}$/;
export const LOCAL_DELIVERY_IMAGE_LABEL = `io.blog-x.refresh-kind=${LOCAL_DELIVERY_REFRESH_KIND}`;
export const DOCKER_IMAGE_RETENTION_FORMAT = "blog-x-docker-image-retention";
export const DOCKER_IMAGE_RETENTION_VERSION = 1;
const BLOG_X_REFRESH_WORKDIR = "/refresh-workspace";

function fail(message) { throw new Error(message); }

function exactArgumentMode(argv) {
  if (!Array.isArray(argv) || argv.some((item) => typeof item !== "string")) fail("Docker image retention usage is invalid");
  if (argv.length === 0) return "report";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  if (argv.length === 1 && argv[0] === "--help") return "help";
  fail("Docker image retention usage is invalid");
}

function stdoutLines(result) {
  if (!result || typeof result.stdout !== "string") fail("Docker image retention discovery is invalid");
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function immutableImageId(value) {
  if (typeof value !== "string" || !imageIdPattern.test(value)) fail("Docker image retention discovery is invalid");
  return value;
}

function containerId(value) {
  if (typeof value !== "string" || !containerIdPattern.test(value)) fail("Docker image retention discovery is invalid");
  return value;
}

function parsedSingleObject(result) {
  if (!result || typeof result.stdout !== "string") fail("Docker image retention discovery is invalid");
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { fail("Docker image retention discovery is invalid"); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0] || typeof parsed[0] !== "object" || Array.isArray(parsed[0])) fail("Docker image retention discovery is invalid");
  return parsed[0];
}

export function selectRetentionCandidates({ images, referencedImageIds } = {}) {
  if (!Array.isArray(images) || !Array.isArray(referencedImageIds)) fail("Docker image retention discovery is invalid");
  const references = new Set(referencedImageIds.map(immutableImageId));
  const candidates = new Map();
  for (const image of images) {
    if (!image || typeof image !== "object" || Array.isArray(image) || !imageIdPattern.test(image.id ?? "") || !Number.isSafeInteger(image.size) || image.size < 0) fail("Docker image retention discovery is invalid");
    if (!references.has(image.id)) candidates.set(image.id, image.size);
  }
  return [...candidates].sort(([left], [right]) => left.localeCompare(right)).map(([id, size]) => ({ id, size }));
}

export function buildDockerImageRetentionReport({ mode, candidates } = {}) {
  if (!(["report", "apply"].includes(mode)) || !Array.isArray(candidates)) fail("Docker image retention discovery is invalid");
  const candidateImageIds = candidates.map((candidate) => immutableImageId(candidate?.id));
  if (new Set(candidateImageIds).size !== candidateImageIds.length || candidateImageIds.some((value, index) => index > 0 && candidateImageIds[index - 1].localeCompare(value) >= 0)) fail("Docker image retention discovery is invalid");
  let reclaimableBytes = 0n;
  for (const candidate of candidates) {
    if (!Number.isSafeInteger(candidate?.size) || candidate.size < 0) fail("Docker image retention discovery is invalid");
    reclaimableBytes += BigInt(candidate.size);
  }
  return Object.freeze({
    format: DOCKER_IMAGE_RETENTION_FORMAT,
    version: DOCKER_IMAGE_RETENTION_VERSION,
    mode,
    candidateImageIds,
    candidateCount: candidateImageIds.length,
    reclaimableBytes: reclaimableBytes.toString(10),
  });
}

async function discoverCandidates(run) {
  if (typeof run !== "function") fail("Docker image retention discovery is invalid");
  const labeled = new Set(stdoutLines(await run("docker", ["image", "ls", "--quiet", "--no-trunc", "--filter", `label=${LOCAL_DELIVERY_IMAGE_LABEL}`])).map(immutableImageId));
  const dangling = new Set(stdoutLines(await run("docker", ["image", "ls", "--quiet", "--no-trunc", "--filter", "dangling=true"])).map(immutableImageId));
  const all = new Set(stdoutLines(await run("docker", ["image", "ls", "--all", "--quiet", "--no-trunc"])).map(immutableImageId));
  if ([...labeled, ...dangling].some((id) => !all.has(id))) fail("Docker image retention discovery is invalid");
  const images = [];
  const parentImageIds = [];
  for (const id of [...all].sort()) {
    const fact = parsedSingleObject(await run("docker", ["image", "inspect", id]));
    const parent = fact.Parent ?? "";
    if (fact.Id !== id || typeof parent !== "string" || parent && !imageIdPattern.test(parent)) fail("Docker image retention discovery is invalid");
    if (parent) parentImageIds.push(parent);
    if (!labeled.has(id) && !dangling.has(id)) continue;
    const exactLabel = fact.Config?.Labels?.["io.blog-x.refresh-kind"] === LOCAL_DELIVERY_REFRESH_KIND;
    const hasNoRepositoryReference = [fact.RepoTags, fact.RepoDigests].every((value) => value == null || Array.isArray(value) && value.length === 0);
    const exactDanglingRefresh = dangling.has(id) && hasNoRepositoryReference && fact.Config?.WorkingDir === BLOG_X_REFRESH_WORKDIR;
    if (labeled.has(id) && !exactLabel || !Number.isSafeInteger(fact.Size) || fact.Size < 0) fail("Docker image retention discovery is invalid");
    if (!exactLabel && !exactDanglingRefresh) continue;
    images.push({ id, size: fact.Size });
  }
  const containers = [...new Set(stdoutLines(await run("docker", ["container", "ls", "--all", "--quiet", "--no-trunc"])).map(containerId))].sort();
  const referencedImageIds = [];
  for (const id of containers) {
    const fact = parsedSingleObject(await run("docker", ["container", "inspect", id]));
    referencedImageIds.push(immutableImageId(fact.Image));
  }
  return selectRetentionCandidates({ images, referencedImageIds: [...referencedImageIds, ...parentImageIds] });
}

async function defaultRun(command, args) {
  return execFileAsync(command, args, { encoding: "utf8", maxBuffer: 1024 * 1024 });
}

function writeReport(output, report) {
  if (!output || typeof output.write !== "function") fail("Docker image retention output is invalid");
  output.write(`${JSON.stringify(report)}\n`);
}

/** Report exact unused local-delivery image IDs, or remove that recomputed set after --apply. */
export async function runDockerImageRetentionCli({ argv = [], run = defaultRun, output = process.stdout } = {}) {
  const mode = exactArgumentMode(argv);
  if (mode === "help") {
    if (!output || typeof output.write !== "function") fail("Docker image retention output is invalid");
    output.write("Usage: corepack pnpm docker:retention [-- --apply]\n");
    return { mode };
  }
  try {
    const candidates = await discoverCandidates(run);
    const report = buildDockerImageRetentionReport({ mode, candidates });
    if (mode === "apply") {
      for (const id of report.candidateImageIds) await run("docker", ["image", "rm", id]);
    }
    writeReport(output, report);
    return report;
  } catch {
    try { output?.write?.("DOCKER IMAGE RETENTION FAILED\n"); } catch { /* terminal failures must not reveal daemon output */ }
    throw new Error("Docker image retention failed");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { await runDockerImageRetentionCli({ argv: process.argv.slice(2) }); } catch { process.exitCode = 1; }
}
