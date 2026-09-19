import { randomUUID } from "node:crypto";
import { lstat, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { collectLocalStatus, evaluateCanonicalStatus, validateLocalProject, validateStatusOrigin } from "./ops-status.mjs";
import { notifyStatus } from "./ops/notify.mjs";

const policyKeys = "collection,format,provider,resultRoot,role,stateRoot,version";
const canonicalWebhookUrlEnv = "BLOG_X_NOTIFY_WEBHOOK_URL";
const canonicalWebhookAuthorizationEnv = "BLOG_X_NOTIFY_WEBHOOK_AUTHORIZATION";
const maximumMonitorOutcomeFiles = 2_016;
const canonicalOutcomeName = /^outcome-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i;

function invalidPolicy() { throw new Error("monitor policy is invalid"); }

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === keys;
}

function absolutePath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) invalidPolicy();
  return value;
}

function strictProvider(value) {
  if (!exactKeys(value, "kind") && !exactKeys(value, "kind,spoolRoot") && !exactKeys(value, "kind,urlEnv") && !exactKeys(value, "authorizationEnv,kind,urlEnv")) invalidPolicy();
  if (value.kind === "stdout" && exactKeys(value, "kind")) return { kind: "stdout" };
  if (value.kind === "file" && exactKeys(value, "kind,spoolRoot")) return { kind: "file", spoolRoot: absolutePath(value.spoolRoot) };
  if (value.kind === "webhook" && (exactKeys(value, "kind,urlEnv") || exactKeys(value, "authorizationEnv,kind,urlEnv"))
    && value.urlEnv === canonicalWebhookUrlEnv && (value.authorizationEnv === undefined || value.authorizationEnv === canonicalWebhookAuthorizationEnv)) {
    return value.authorizationEnv === undefined ? { kind: "webhook", urlEnv: canonicalWebhookUrlEnv }
      : { kind: "webhook", urlEnv: canonicalWebhookUrlEnv, authorizationEnv: canonicalWebhookAuthorizationEnv };
  }
  invalidPolicy();
}

function strictCollection(role, value) {
  const edge = role === "edge";
  const keys = edge ? "project,tlsEvidencePath,webOrigin" : "backupResultsRoot,jobResultsRoot,project,webOrigin";
  if (!exactKeys(value, keys)) invalidPolicy();
  let base;
  try { base = { project: validateLocalProject(value.project), webOrigin: validateStatusOrigin(value.webOrigin) }; } catch { invalidPolicy(); }
  if (edge) return { ...base, tlsEvidencePath: absolutePath(value.tlsEvidencePath) };
  return { ...base, jobResultsRoot: absolutePath(value.jobResultsRoot), backupResultsRoot: absolutePath(value.backupResultsRoot) };
}

function strictPolicy(value) {
  if (!exactKeys(value, policyKeys) || value.format !== "blog-x-monitor-policy" || value.version !== 1 || !["edge", "data"].includes(value.role)) invalidPolicy();
  return {
    format: value.format,
    version: value.version,
    role: value.role,
    resultRoot: absolutePath(value.resultRoot),
    stateRoot: absolutePath(value.stateRoot),
    provider: strictProvider(value.provider),
    collection: strictCollection(value.role, value.collection),
  };
}

async function safeRoot(root) {
  const info = await lstat(root).catch(() => null);
  if (!info || !info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) throw new Error("monitor authority is unsafe");
  return root;
}

async function authorizePolicy(policy) {
  const roots = [policy.resultRoot, policy.stateRoot];
  if (policy.role === "edge") roots.push(dirname(policy.collection.tlsEvidencePath));
  else roots.push(policy.collection.jobResultsRoot, policy.collection.backupResultsRoot);
  if (policy.provider.kind === "file") roots.push(policy.provider.spoolRoot);
  await Promise.all(roots.map((root) => safeRoot(root)));
}

function collectionFailure(role, observed) {
  return { format: "blog-x-ops-status", version: 1, scope: role, observedAt: observed.toISOString(), status: "FAIL", checks: [{ id: "collection", status: "FAIL" }] };
}

function canonicalStatus(value, role) {
  if (!exactKeys(value, "checks,format,observedAt,scope,status,version") || value.format !== "blog-x-ops-status" || value.version !== 1
    || value.scope !== role || !["PASS", "FAIL"].includes(value.status) || !Array.isArray(value.checks)
    || !value.checks.every((item) => exactKeys(item, "id,status") && /^[a-z][a-z0-9-]{0,63}$/.test(item.id) && ["PASS", "FAIL", "NOT_EVALUATED"].includes(item.status))) {
    throw new Error("monitor evaluation is invalid");
  }
  return value;
}

function outcome(status, notificationOutcome, now) {
  return {
    format: "blog-x-monitor-outcome", version: 1, runId: randomUUID(), scope: status.scope,
    observedAt: now.toISOString(), status: status.status, notificationOutcome,
    failingCheckIds: status.checks.filter((item) => item.status === "FAIL").map((item) => item.id).sort(),
  };
}

async function record(root, value) {
  await safeRoot(root);
  const target = join(root, `outcome-${value.runId}.json`);
  const temp = join(root, `.${value.runId}.tmp`);
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
    await handle.close();
    await rename(temp, target);
    return target;
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(temp).catch(() => undefined);
  }
}

function isVanished(error) {
  return error && typeof error === "object" && error.code === "ENOENT";
}

async function pruneMonitorOutcomes(root, publishedTarget, operations = {}) {
  const listDirectory = operations.readdir ?? readdir;
  const inspect = operations.lstat ?? lstat;
  const remove = operations.unlink ?? unlink;
  const publishedName = basename(publishedTarget);
  try {
    await safeRoot(root);
    const entries = await listDirectory(root, { withFileTypes: true });
    if (!Array.isArray(entries)) throw new Error("directory listing is invalid");
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !canonicalOutcomeName.test(entry.name)) continue;
      const candidate = join(root, entry.name);
      let info;
      try { info = await inspect(candidate); } catch (error) {
        if (isVanished(error)) continue;
        throw error;
      }
      if (!info.isFile() || info.isSymbolicLink()) continue;
      candidates.push({ name: entry.name, modifiedAt: info.mtimeMs });
    }
    candidates.sort((left, right) => right.modifiedAt - left.modifiedAt || right.name.localeCompare(left.name));
    const retained = new Set([publishedName]);
    for (const candidate of candidates) {
      if (candidate.name !== publishedName && retained.size < maximumMonitorOutcomeFiles) retained.add(candidate.name);
    }
    for (const candidate of candidates) {
      if (retained.has(candidate.name)) continue;
      try { await remove(join(root, candidate.name)); } catch (error) {
        if (!isVanished(error)) throw error;
      }
    }
  } catch {
    throw new Error("monitor outcome retention failed");
  }
}

/** Collect, evaluate, notify, and record one strict monitor-policy run. */
export async function runMonitor({ policy, now = () => new Date(), collect = collectLocalStatus, evaluate = evaluateCanonicalStatus, notify = notifyStatus, write = () => {}, retentionOperations = {} }) {
  const parsed = strictPolicy(policy);
  await authorizePolicy(parsed);
  const observed = now();
  let status;
  try {
    const facts = await collect(parsed.collection);
    status = canonicalStatus(evaluate(facts, { role: parsed.role, now: observed }), parsed.role);
  } catch {
    status = collectionFailure(parsed.role, observed);
  }
  let notificationOutcome = "failed";
  try {
    const result = await notify({ status, provider: parsed.provider, stateRoot: parsed.stateRoot, now, write });
    notificationOutcome = result.suppressed ? "suppressed" : "sent";
  } catch { notificationOutcome = "failed"; }
  const terminal = outcome(status, notificationOutcome, observed);
  const publishedTarget = await record(parsed.resultRoot, terminal);
  await pruneMonitorOutcomes(parsed.resultRoot, publishedTarget, retentionOperations);
  write(`${JSON.stringify(terminal)}\n`);
  return { exitCode: notificationOutcome === "failed" || status.status !== "PASS" ? 1 : 0, outcome: terminal };
}

/** A narrow injectable seam for the one-shot systemd CLI. */
export async function runMonitorCli(args, dependencies = {}) {
  if (!Array.isArray(args) || args.length !== 1 || typeof args[0] !== "string" || !args[0].startsWith("--policy=") || args[0].slice(9).length === 0) throw new Error("Usage: --policy=<file>");
  const policyPath = args[0].slice(9);
  const { readPolicy = async (path) => JSON.parse(await readFile(path, "utf8")), ...monitorDependencies } = dependencies;
  return runMonitor({ policy: await readPolicy(policyPath), ...monitorDependencies });
}

async function main() {
  const result = await runMonitorCli(process.argv.slice(2), { write: (line) => process.stdout.write(line) });
  process.exitCode = result.exitCode;
}

if (process.argv[1]?.endsWith("ops-monitor.mjs")) main().catch(() => { process.exitCode = 1; });
