import { createHash, randomBytes } from "node:crypto";
import { link, lstat, open, readdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvidenceArtifact, validateEvidenceBundleRoot } from "./bundle.mjs";
import { formatReleaseDecision, evaluatePreReleaseReadiness, parseReleaseArtifact } from "./validate.mjs";

const sourceLayout = Object.freeze([
  ["authorization", "authorization.json", "blog-x-release-authorization"],
  ["hostBaselines", "host-main.json", "blog-x-release-host-baseline"],
  ["hostBaselines", "host-secondary.json", "blog-x-release-host-baseline"],
  ["networkBoundary", "network.json", "blog-x-release-network-boundary"],
  ["backupRestore", "backup.json", "blog-x-release-backup-restore"],
  ["operations", "operations.json", "blog-x-release-operations"],
  ["rollback", "rollback.json", "blog-x-release-rollback"],
]);
const sourceNames = new Set(sourceLayout.map(([, name]) => name));
const maxSourceBytes = 256 * 1024;

function invalid(reason = "evidence.invalid") {
  return { status: "INVALID", exitCode: 2, reasons: [reason] };
}

function safeDecision(decision) {
  if (decision?.status === "PRE_RELEASE_READY" || decision?.status === "BLOCKED") return decision;
  return invalid();
}

function assertOwnerPrivate(info, label) {
  if ((info.mode & 0o077) !== 0 || (info.mode & 0o600) !== 0o600) throw new Error(`${label}.permissions`);
}

async function enumerateSources(root) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("bundle.root");
  assertOwnerPrivate(rootInfo, "bundle.root");
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.length !== sourceNames.size || entries.some((entry) => !sourceNames.has(entry.name) || !entry.isFile() || entry.isSymbolicLink())) throw new Error("bundle.members");
  for (const name of sourceNames) {
    const info = await lstat(join(root, name));
    if (!info.isFile() || info.isSymbolicLink() || info.size > maxSourceBytes) throw new Error("bundle.member");
    assertOwnerPrivate(info, "bundle.member");
  }
}

function reference(name, value, bytes) {
  return {
    id: name.slice(0, -5),
    artifact: name,
    type: value.format,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    observedAt: value.observedAt,
    validUntil: value.validUntil,
    outcome: value.outcome,
  };
}

async function buildEvidence(root, now) {
  const sections = {
    authorization: [], hostBaselines: [], networkBoundary: [], backupRestore: [], operations: [], rollback: [],
  };
  for (const [section, name, expectedType] of sourceLayout) {
    const loaded = await readEvidenceArtifact(root, name);
    if (loaded.bytes.byteLength > maxSourceBytes) throw new Error("bundle.member");
    const value = parseReleaseArtifact(JSON.parse(loaded.bytes.toString("utf8")), expectedType, now);
    sections[section].push(reference(name, value, loaded.bytes));
  }
  return {
    format: "blog-x-release-evidence",
    version: 2,
    state: "PRE_RELEASE_READY",
    ...Object.fromEntries(Object.entries(sections).map(([name, references]) => [name, { status: "ready", references }])),
  };
}

async function writePrivateCandidate(root, evidence) {
  const name = `candidate-evidence-${process.pid}-${randomBytes(12).toString("hex")}.json`;
  const handle = await open(join(root, name), "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(evidence)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return name;
}

async function unlinkOwned(root, name, inode) {
  try {
    const info = await lstat(join(root, name));
    if (info.isFile() && !info.isSymbolicLink() && info.ino === inode) await unlink(join(root, name));
  } catch { /* Best-effort cleanup only for the inode created by this invocation. */ }
}

export async function assemblePreReleaseEvidence({ bundleRoot, now = () => new Date() } = {}) {
  let root;
  let candidate;
  let candidateInode;
  let published = false;
  try {
    root = validateEvidenceBundleRoot(bundleRoot);
    await enumerateSources(root);
    const clock = now().getTime();
    const evidence = await buildEvidence(root, clock);
    candidate = await writePrivateCandidate(root, evidence);
    candidateInode = (await lstat(join(root, candidate))).ino;
    const candidateDecision = await evaluatePreReleaseReadiness(evidence, { bundleRoot: root, evidencePath: candidate, enforceExactFiles: false, now });
    if (candidateDecision.status !== "PRE_RELEASE_READY") return safeDecision(candidateDecision);
    try {
      await link(join(root, candidate), join(root, "evidence.json"));
      published = true;
    } catch (error) {
      if (error?.code === "EEXIST") return invalid("evidence.collision");
      return invalid();
    }
    await unlinkOwned(root, candidate, candidateInode);
    candidate = undefined;
    const finalDecision = await evaluatePreReleaseReadiness(evidence, { bundleRoot: root, evidencePath: "evidence.json", enforceExactFiles: true, now });
    if (finalDecision.status !== "PRE_RELEASE_READY") {
      await unlinkOwned(root, "evidence.json", candidateInode);
      published = false;
      return safeDecision(finalDecision);
    }
    return finalDecision;
  } catch {
    return invalid();
  } finally {
    if (candidate) await unlinkOwned(root, candidate, candidateInode);
    if (published === false) await unlinkOwned(root, candidate, candidateInode);
  }
}

function option(argv, name) {
  const prefix = `--${name}=`;
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

export async function runPreReleaseEvidenceAssemblerCli({ argv = process.argv.slice(2), output = process.stdout, now } = {}) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const root = option(args, "bundle-root");
  const decision = root && args.length === 1 ? await assemblePreReleaseEvidence({ bundleRoot: root, now }) : invalid();
  output.write(`${formatReleaseDecision(decision)}\n`);
  return decision;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPreReleaseEvidenceAssemblerCli().then((decision) => { process.exitCode = decision.exitCode; });
}
