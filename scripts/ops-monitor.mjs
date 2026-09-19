import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { evaluateCanonicalStatus } from "./ops-status.mjs";
import { notifyStatus } from "./ops/notify.mjs";

function strictPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "resultRoot,role,stateRoot") throw new Error("monitor policy is invalid");
  if (!['edge', 'data'].includes(value.role) || ![value.resultRoot, value.stateRoot].every((path) => typeof path === 'string' && isAbsolute(path))) throw new Error("monitor policy is invalid");
  return value;
}
async function safeRoot(root) { const info = await lstat(root); if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) throw new Error("monitor authority is unsafe"); return root; }
function outcome(status, notificationOutcome, now) { return { format: "blog-x-monitor-outcome", version: 1, runId: randomUUID(), scope: status.scope, observedAt: now.toISOString(), status: status.status, notificationOutcome, failingCheckIds: status.checks.filter((item) => item.status === "FAIL").map((item) => item.id).sort() }; }
async function record(root, value) { await safeRoot(root); const target = join(root, `outcome-${value.runId}.json`); const temp = join(root, `.${value.runId}.tmp`); const handle = await open(temp, "wx", 0o600); try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); await handle.close(); await rename(temp, target); return target; } finally { await handle.close().catch(() => undefined); await unlink(temp).catch(() => undefined); } }
export async function runMonitor({ policy, facts, provider = { kind: "stdout" }, now = () => new Date(), evaluate = evaluateCanonicalStatus, notify = notifyStatus, write = () => {} }) {
  const parsed = strictPolicy(policy); const observed = now(); let status;
  try { status = evaluate(facts, { role: parsed.role, now: observed }); } catch { status = { format: "blog-x-ops-status", version: 1, scope: parsed.role, observedAt: observed.toISOString(), status: "FAIL", checks: [{ id: "collection", status: "FAIL" }] }; }
  let notificationOutcome = "failed";
  try { const result = await notify({ status, provider, stateRoot: parsed.stateRoot, now, write }); notificationOutcome = result.suppressed ? "suppressed" : "sent"; } catch { notificationOutcome = "failed"; }
  const terminal = outcome(status, notificationOutcome, observed); await record(parsed.resultRoot, terminal); write(`${JSON.stringify(terminal)}\n`); return { exitCode: notificationOutcome === "failed" ? 1 : status.status === "PASS" ? 0 : 1, outcome: terminal };
}
async function main() { const args = process.argv.slice(2); if (args.length !== 1 || !args[0].startsWith("--policy=")) throw new Error("Usage: --policy=<file>"); const policy = JSON.parse(await readFile(args[0].slice(9), "utf8")); const result = await runMonitor({ policy, facts: {} , write: (line) => process.stdout.write(line) }); process.exitCode = result.exitCode; }
if (process.argv[1]?.endsWith("ops-monitor.mjs")) main().catch(() => { process.exitCode = 1; });
