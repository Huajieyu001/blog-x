import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function validateEvidenceBundleRoot(value) {
  if (typeof value !== "string" || !value || value.includes("${") || value.includes("..")) throw new Error("release bundle root is unresolved or broad");
  const target = resolve(value);
  const generated = dirname(target) === resolve(tmpdir()) && /^blog-x-release-evidence-[A-Za-z0-9_-]{6,64}$/.test(basename(target));
  if (!generated && target !== repositoryRoot) throw new Error("release bundle root must be the exact repository or generated evidence directory");
  return target;
}

function validateRelativeArtifact(value) {
  if (typeof value !== "string" || !/^(?:[a-z0-9][a-z0-9.-]*\/)*[a-z0-9][a-z0-9.-]*\.json$/.test(value)
    || value.includes("..") || value.startsWith("/") || value.includes("\\")) throw new Error("release artifact path is unsafe");
  return value;
}

async function resolveRegularArtifact(root, artifact) {
  const bundleRoot = validateEvidenceBundleRoot(root);
  const relativeArtifact = validateRelativeArtifact(artifact);
  const target = resolve(bundleRoot, relativeArtifact);
  if (relative(bundleRoot, target).startsWith("..") || resolve(target) === bundleRoot) throw new Error("release artifact escapes its bundle");
  let cursor = bundleRoot;
  for (const segment of relativeArtifact.split("/")) {
    cursor = resolve(cursor, segment);
    const info = await lstat(cursor).catch(() => { throw new Error("release artifact is missing"); });
    if (info.isSymbolicLink()) throw new Error("release artifact must not be a link");
  }
  const info = await lstat(target);
  if (!info.isFile()) throw new Error("release artifact must be a regular file");
  const actualRoot = await realpath(bundleRoot);
  const actualTarget = await realpath(target);
  if (relative(actualRoot, actualTarget).split(sep)[0] === "..") throw new Error("release artifact escapes its bundle");
  return target;
}

export async function readEvidenceArtifact(root, artifact) {
  const target = await resolveRegularArtifact(root, artifact);
  return { path: target, bytes: await readFile(target) };
}

export async function hashEvidenceArtifact(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("release artifact must be a regular file");
  const hash = createHash("sha256");
  await new Promise((accept, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", accept);
  });
  return hash.digest("hex");
}
