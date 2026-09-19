import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertSafeResultRoot, writeJobReceipt } from "./job-results.mjs";

const jobs = new Set(["retention", "publish-due"]);
const maximumOutputBytes = 32 * 1024;
export const secondaryJobTimeoutMs = 120_000;

export function parseSecondaryJobArguments(arguments_) {
  if (arguments_.length !== 2 || !jobs.has(arguments_[0] ?? "")) return { ok: false };
  const match = /^--results-root=(\/[^\0]+)$/.exec(arguments_[1] ?? "");
  return match && !match[1].includes("//") ? { ok: true, job: arguments_[0], resultRoot: match[1] } : { ok: false };
}

/** The only two compose operations this runner can invoke. */
export function fixedSecondaryCommand(job) {
  if (!jobs.has(job)) throw new Error("invalid job");
  return [
    "compose", "--project-name", "blog-x-secondary", "--env-file", "/etc/blog-x/secondary.env", "--file", "/opt/blog-x/deploy/secondary/compose.yaml",
    "exec", "-T", "api", "corepack", "pnpm", "--filter", "@blog-x/api",
    ...(job === "retention" ? ["retention", "--views-limit=100", "--sessions-limit=100"] : ["publish:due", "--limit=100"]),
  ];
}

function executeFixedCommand(command, { timeoutMs = secondaryJobTimeoutMs } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn("docker", command, { shell: false, env: { PATH: process.env.PATH ?? "" }, stdio: ["ignore", "pipe", "pipe"] });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr });
    };
    const capture = (target) => (chunk) => {
      if (stdout.length + stderr.length + chunk.length > maximumOutputBytes) {
        child.kill("SIGKILL");
        return;
      }
      if (target === "stdout") stdout += chunk; else stderr += chunk;
    };
    child.stdout.on("data", capture("stdout"));
    child.stderr.on("data", capture("stderr"));
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.once("error", () => finish({ exitCode: null, signal: null, spawnError: true }));
    child.once("close", (exitCode, signal) => finish({ exitCode, signal, timedOut }));
  });
}

function isoNow(now) { return now().toISOString(); }

function hasExactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function isTimestamp(value) { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function isCount(value) { return Number.isSafeInteger(value) && value >= 0; }

function parseSuccess(job, output) {
  let value;
  try { value = JSON.parse(output); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (job === "retention") {
    if (!hasExactKeys(value, ["format", "version", "command", "observedAt", "views", "sessions"]) || value.format !== "blog-x-operational-retention" || value.version !== 1 || value.command !== "retention") return null;
    if (!hasExactKeys(value.views, ["limit", "retainedFromDay", "deleted"]) || !hasExactKeys(value.sessions, ["limit", "deleted", "expiredBefore", "revokedBefore"])) return null;
    if (value.views.limit !== 100 || value.sessions.limit !== 100 || !/^\d{4}-\d{2}-\d{2}$/.test(value.views.retainedFromDay) || !isCount(value.views.deleted) || !isCount(value.sessions.deleted) || !isTimestamp(value.observedAt) || !isTimestamp(value.sessions.expiredBefore) || !isTimestamp(value.sessions.revokedBefore)) return null;
    return { observedAt: value.observedAt, counts: { viewsDeleted: value.views.deleted, sessionsDeleted: value.sessions.deleted } };
  }
  if (!hasExactKeys(value, ["format", "version", "command", "at", "limit", "claimed", "published", "publishedIds"]) || value.format !== "blog-x-publish-due" || value.version !== 1 || value.command !== "publish-due" || value.limit !== 100 || !isTimestamp(value.at) || !isCount(value.claimed) || !isCount(value.published) || !Array.isArray(value.publishedIds) || value.claimed < value.published || value.published !== value.publishedIds.length || value.publishedIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) return null;
  return { observedAt: value.at, counts: { claimed: value.claimed, published: value.published } };
}

export async function runSecondaryJob({ job, resultRoot, execute = executeFixedCommand, writeReceipt = writeJobReceipt, now = () => new Date(), createRunId = randomUUID }) {
  if (!jobs.has(job)) throw new Error("invalid job");
  await assertSafeResultRoot(resultRoot);
  const startedAt = isoNow(now);
  let terminal = { status: "failed", code: "spawn_failed", counts: {}, observedAt: startedAt };
  try {
    const outcome = await execute(fixedSecondaryCommand(job));
    if (outcome.timedOut) terminal.code = "timeout";
    else if (outcome.spawnError) terminal.code = "spawn_failed";
    else if (outcome.signal) terminal.code = "signaled";
    else if (outcome.exitCode !== 0) terminal.code = "command_failed";
    else {
      const parsed = parseSuccess(job, outcome.stdout);
      terminal = parsed ? { status: "succeeded", code: "ok", counts: parsed.counts, observedAt: parsed.observedAt } : terminal;
      if (!parsed) terminal.code = "invalid_output";
    }
  } catch {
    terminal.code = "spawn_failed";
  }
  const receiptPath = await writeReceipt(resultRoot, {
    format: "blog-x-job-receipt", version: 1, job, runId: createRunId(), observedAt: terminal.observedAt,
    completedAt: isoNow(now), status: terminal.status, code: terminal.code, counts: terminal.counts,
  });
  return { exitCode: terminal.status === "succeeded" ? 0 : 1, receiptPath };
}

async function main() {
  const parsed = parseSecondaryJobArguments(process.argv.slice(2));
  if (!parsed.ok) { process.exitCode = 1; return; }
  try {
    const result = await runSecondaryJob(parsed);
    process.exitCode = result.exitCode;
  } catch {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
