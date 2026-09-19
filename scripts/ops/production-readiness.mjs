import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat as nodeLstat, readFile as nodeReadFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assertLocalDeliveryEvidenceSchema, parseRevisionAddressedEvidencePath } from "../refresh-local-runtime-core.mjs";
import { evaluatePreReleaseReadiness } from "../release-gate/validate.mjs";
import { releaseEvidenceSchema } from "../release-gate/schema.mjs";
import { readEvidenceArtifact, validateEvidenceBundleRoot } from "../release-gate/bundle.mjs";

const execFileAsync = promisify(execFile);
const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const SAFE_CODE = /^[a-z][a-z0-9_.-]*$/;
const DEPLOY_PATHS = ["deploy/primary", "deploy/secondary"];
const CANONICAL_EVIDENCE = "ops/release-evidence.blocked.json";
const MAX_OUTPUT = 256 * 1024;
const MAX_DEPLOY_BYTES = 4 * 1024 * 1024;

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function safeCodes(values) { return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && SAFE_CODE.test(value)))].sort(); }
function stableError(code) { return SAFE_CODE.test(code) ? code : "local.untrusted"; }
function normalized(stdout) { return typeof stdout === "string" && Buffer.byteLength(stdout) <= MAX_OUTPUT ? stdout.replace(/\r\n/g, "\n") : null; }
function currentReport() {
  return {
    format: "blog-x-production-rollout-readiness", version: 1, decision: "STOP",
    repository: { branch: "refs/heads/dev", branchMatched: false, head: null, clean: false },
    localDelivery: { receipt: null, receiptSha256: null, implementationRevision: null, implementationAncestor: false, targets: { api: null, web: null } },
    deployArtifacts: { files: [], manifestSha256: null, changedSinceImplementation: null },
    productionEvidence: { source: "canonical", sha256: null, status: "INVALID", reasons: [] },
    prerequisites: { backupRestore: { status: "PENDING", unresolved: [] }, rollback: { status: "PENDING", unresolved: [] } },
    reasons: [],
  };
}
function finish(report, reasons, exitCode = 1) {
  report.reasons = safeCodes(reasons);
  Object.defineProperty(report, "__exitCode", { value: exitCode, enumerable: false });
  return report;
}
function assertGitArgs(args) {
  const joined = args.join("\u0000");
  const permitted = [
    "symbolic-ref\u0000--quiet\u0000HEAD", "rev-parse\u0000HEAD", "status\u0000--porcelain",
    "log\u0000--format=%H\u0000--diff-filter=A\u0000--name-only\u0000--\u0000ops/local-deliveries",
  ];
  if (permitted.includes(joined)) return;
  if (args.length === 3 && args[0] === "ls-files" && args[1] === "--error-unmatch" && /^ops\/local-deliveries\/[a-f0-9]{40}\.json$/.test(args[2])) return;
  if (args.length === 3 && args[0] === "merge-base" && args[1] === "--is-ancestor" && SHA.test(args[2])) return;
  if (args.length === 6 && args[0] === "diff" && args[1] === "--quiet" && SHA.test(args[2].split("..")[0]) && args[2].endsWith("..HEAD")
    && args[3] === "--" && args[4] === "deploy/primary" && args[5] === "deploy/secondary") return;
  if (args.length === 5 && args[0] === "ls-files" && args[1] === "-z" && args[2] === "--" && DEPLOY_PATHS.includes(args[3]) && DEPLOY_PATHS.includes(args[4])) return;
  throw new Error("local.command_policy");
}
async function defaultRun(command, args, options = {}) {
  if (command !== "git") throw new Error("local.command_policy");
  assertGitArgs(args);
  const result = await execFileAsync(command, args, { cwd: options.cwd, encoding: "utf8", timeout: 5_000, maxBuffer: MAX_OUTPUT, windowsHide: true });
  if (typeof result.stdout !== "string" || Buffer.byteLength(result.stdout) > MAX_OUTPUT) throw new Error("local.git_output");
  return result;
}
async function git(run, root, args) { assertGitArgs(args); return normalized((await run("git", args, { cwd: root })).stdout); }
function newestReceiptFromLog(history) {
  if (history === null) throw new Error("local.git_output");
  const lines = history.split("\n").filter(Boolean);
  for (let index = 0; index + 1 < lines.length; index += 1) {
    if (SHA.test(lines[index]) && /^ops\/local-deliveries\/[a-f0-9]{40}\.json$/.test(lines[index + 1])) return lines[index + 1];
  }
  throw new Error("local.receipt_missing");
}
async function localFacts({ root, run, readFile, lstat }) {
  const [branchRaw, headRaw, statusRaw, receiptHistory] = await Promise.all([
    git(run, root, ["symbolic-ref", "--quiet", "HEAD"]), git(run, root, ["rev-parse", "HEAD"]), git(run, root, ["status", "--porcelain"]),
    git(run, root, ["log", "--format=%H", "--diff-filter=A", "--name-only", "--", "ops/local-deliveries"]),
  ]);
  const branch = branchRaw === "refs/heads/dev" ? branchRaw : "refs/heads/dev";
  const head = headRaw && SHA.test(headRaw.trim()) ? headRaw.trim() : null;
  const clean = statusRaw === "";
  const receipt = newestReceiptFromLog(receiptHistory);
  await git(run, root, ["ls-files", "--error-unmatch", receipt]);
  const receiptRevision = parseRevisionAddressedEvidencePath(receipt);
  const receiptPath = resolve(root, receipt);
  const receiptInfo = await lstat(receiptPath);
  if (!receiptInfo?.isFile?.() || receiptInfo.isSymbolicLink?.() || receiptInfo.size > MAX_DEPLOY_BYTES) throw new Error("local.receipt_unsafe");
  const receiptBytes = await readFile(receiptPath);
  const evidence = JSON.parse(Buffer.from(receiptBytes).toString("utf8"));
  assertLocalDeliveryEvidenceSchema(evidence);
  if (evidence.implementationRevision !== receiptRevision) throw new Error("local.receipt_revision");
  let implementationAncestor = false;
  try { await git(run, root, ["merge-base", "--is-ancestor", evidence.implementationRevision]); implementationAncestor = true; } catch { implementationAncestor = false; }
  const pathsRaw = await git(run, root, ["ls-files", "-z", "--", ...DEPLOY_PATHS]);
  if (pathsRaw === null) throw new Error("local.git_output");
  const paths = pathsRaw.split("\0").filter(Boolean).sort();
  if (!paths.length || paths.some((path) => !/^deploy\/(?:primary|secondary)\/[A-Za-z0-9._/-]+$/.test(path) || path.includes(".."))) throw new Error("local.deploy_paths");
  const files = [];
  for (const path of paths) {
    const resolved = resolve(root, path);
    if (relative(root, resolved).split(sep)[0] === "..") throw new Error("local.deploy_paths");
    const info = await lstat(resolved);
    if (!info?.isFile?.() || info.isSymbolicLink?.() || info.size > MAX_DEPLOY_BYTES) throw new Error("local.deploy_member");
    files.push({ path, sha256: sha256(await readFile(resolved)) });
  }
  let deployChanged = true;
  try { await git(run, root, ["diff", "--quiet", `${evidence.implementationRevision}..HEAD`, "--", ...DEPLOY_PATHS]); deployChanged = false; } catch { deployChanged = true; }
  return {
    repository: { branch, branchMatched: branchRaw === "refs/heads/dev", head, clean },
    localDelivery: { receipt, receiptSha256: sha256(receiptBytes), implementationRevision: evidence.implementationRevision, implementationAncestor, targets: { api: evidence.targets.api.id, web: evidence.targets.web.id } },
    deployArtifacts: { files, manifestSha256: sha256(JSON.stringify(files)), changedSinceImplementation: deployChanged },
  };
}
async function evidenceFacts({ root, source, evidencePath, bundleRoot, readFile }) {
  const bytes = source === "canonical" ? await readFile(resolve(root, evidencePath)) : (await readEvidenceArtifact(bundleRoot, evidencePath)).bytes;
  const value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  const evidence = releaseEvidenceSchema.parse(value);
  const decision = await evaluatePreReleaseReadiness(evidence, { bundleRoot: source === "canonical" ? root : bundleRoot, evidencePath });
  const projection = (name) => evidence[name].status === "ready"
    ? { status: "READY", unresolved: [] }
    : { status: "PENDING", unresolved: safeCodes(evidence[name].unresolved) };
  return { source, sha256: sha256(bytes), status: decision.status, reasons: safeCodes(decision.reasons), prerequisites: { backupRestore: projection("backupRestore"), rollback: projection("rollback") } };
}
export async function collectProductionReadiness({ root = rootDirectory, run = defaultRun, readFile = nodeReadFile, lstat = nodeLstat, bundleRoot, evidencePath } = {}) {
  const report = currentReport();
  try {
    const selectedExternal = bundleRoot !== undefined || evidencePath !== undefined;
    if (selectedExternal && (typeof bundleRoot !== "string" || typeof evidencePath !== "string")) return finish(report, ["invocation.paired_options"], 2);
    const source = selectedExternal ? "external" : "canonical";
    const bundle = selectedExternal ? validateEvidenceBundleRoot(bundleRoot) : root;
    const evidence = selectedExternal ? evidencePath : CANONICAL_EVIDENCE;
    const [local, production] = await Promise.all([localFacts({ root, run, readFile, lstat }), evidenceFacts({ root, source, evidencePath: evidence, bundleRoot: bundle, readFile })]);
    Object.assign(report, local);
    report.productionEvidence = { source: production.source, sha256: production.sha256, status: production.status, reasons: production.reasons };
    report.prerequisites = production.prerequisites;
    const reasons = [...production.reasons];
    if (!report.repository.branchMatched) reasons.push("repository.branch");
    if (!report.repository.clean) reasons.push("repository.dirty");
    if (!report.repository.head) reasons.push("repository.head");
    if (!report.localDelivery.implementationAncestor) reasons.push("local.implementation_ancestor");
    if (report.deployArtifacts.changedSinceImplementation) reasons.push("deploy.changed_since_delivery");
    const go = source === "external" && production.status === "PRE_RELEASE_READY" && reasons.length === 0;
    report.decision = go ? "GO" : "STOP";
    return finish(report, reasons, go ? 0 : 1);
  } catch (error) {
    return finish(report, [stableError(error instanceof Error ? error.message : "local.untrusted")], 2);
  }
}
export function formatProductionReadinessReport(report) { return JSON.stringify(report); }
function parseArguments(argv) {
  const values = new Map(); let expectStop = false;
  for (const arg of argv) {
    if (arg === "--expect-stop") { if (expectStop) throw new Error("invocation.duplicate"); expectStop = true; continue; }
    const match = /^--(bundle-root|evidence)=(.+)$/.exec(arg);
    if (!match || values.has(match[1])) throw new Error("invocation.invalid");
    values.set(match[1], match[2]);
  }
  if (values.has("bundle-root") !== values.has("evidence")) throw new Error("invocation.paired_options");
  return { expectStop, bundleRoot: values.get("bundle-root"), evidencePath: values.get("evidence") };
}
export async function runProductionReadinessCli({ argv = process.argv.slice(2), output = process.stdout, collect = collectProductionReadiness } = {}) {
  let report;
  let expectStop = false;
  try {
    const parsed = parseArguments(argv); expectStop = parsed.expectStop;
    report = await collect({ bundleRoot: parsed.bundleRoot, evidencePath: parsed.evidencePath });
  } catch {
    report = finish(currentReport(), ["invocation.invalid"], 2);
  }
  const baseExitCode = Number.isInteger(report.__exitCode) ? report.__exitCode : report.decision === "GO" ? 0 : 1;
  const exitCode = baseExitCode === 1 && expectStop ? 0 : baseExitCode;
  output.write(`${formatProductionReadinessReport(report)}\n`);
  return { report, exitCode };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runProductionReadinessCli(); process.exitCode = result.exitCode;
}
