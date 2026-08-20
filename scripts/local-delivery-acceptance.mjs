import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);
const maximumOutputBytes = 8 * 1024 * 1024;
const childTimeoutMs = 10 * 60_000;
const phase6Prefix = "BLOG X PHASE6 DATA RESULT ";
const phase7Prefix = "BLOG X PHASE7 BROWSER RESULT ";
const acceptancePrefix = "BLOG X V1.1 ACCEPTANCE RESULT ";

export const LOCAL_DELIVERY_ACCEPTANCE_FORMAT = "blog-x-v1.1-local-delivery-acceptance";

function exactKeys(value, keys) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function assertCounts(value, label) {
  if (!exactKeys(value, ["tests", "passed", "failed", "cancelled", "skipped", "todo"])) throw new Error(`${label} counts are incomplete`);
  for (const key of Object.keys(value)) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error(`${label} counts are invalid`);
  }
  if (!value.tests || !value.passed || value.tests !== value.passed + value.failed + value.cancelled + value.skipped + value.todo
    || value.failed || value.cancelled || value.skipped || value.todo) throw new Error(`${label} counts are not complete pass-only evidence`);
  return value;
}

function sumCounts(values) {
  return values.reduce((total, counts) => {
    for (const key of Object.keys(total)) total[key] += counts[key];
    return total;
  }, { tests: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
}

function normalizedRedactedOutput(value) {
  const output = String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r\n?/g, "\n");
  return output
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/((?:set-)?cookie\s*:\s*[^\n]*blog_x_session=)[^;\s]+/gi, "$1[REDACTED]")
    .replace(/(blog_x_session=)[^;\s]+/gi, "$1[REDACTED]")
    .replace(/\b(password|token|secret)\s*=\s*[^\s]+/gi, "$1=[REDACTED]");
}

function assertNoRawSecrets(value, label) {
  const output = String(value);
  if (/postgres(?:ql)?:\/\/[^\s]+/i.test(output)
    || /blog_x_session=(?!\[REDACTED\])[^;\s]+/i.test(output)
    || /\b(?:password|token|secret)\s*=\s*(?!\[REDACTED\])[^\s]+/i.test(output)) {
    throw new Error(`${label} output contains raw secret-bearing material`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseOneLine(output, prefix, label) {
  const lines = String(output).replace(/\r\n?/g, "\n").split("\n").filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) throw new Error(`${label} output must contain exactly one result record`);
  try { return JSON.parse(lines[0].slice(prefix.length)); } catch { throw new Error(`${label} result record is invalid JSON`); }
}

function parsePhase6Record(value) {
  if (!exactKeys(value, ["format", "version", "suites", "counts", "releaseState"])
    || value.format !== "blog-x-phase6-data-result" || value.version !== 1 || value.releaseState !== "BLOCKED"
    || !Array.isArray(value.suites) || value.suites.length !== 7) throw new Error("Phase 6 result record has an unsupported format or incomplete suite selection");
  const seen = new Set();
  for (const suite of value.suites) {
    if (!exactKeys(suite, ["id", "kind", "counts"]) || typeof suite.id !== "string"
      || !["database", "node", "boundary"].includes(suite.kind) || seen.has(suite.id)) throw new Error("Phase 6 result record suite schema is invalid");
    seen.add(suite.id);
    assertCounts(suite.counts, `Phase 6 suite ${suite.id}`);
  }
  const totals = sumCounts(value.suites.map((suite) => suite.counts));
  assertCounts(value.counts, "Phase 6 result");
  if (JSON.stringify(totals) !== JSON.stringify(value.counts)) throw new Error("Phase 6 result counts do not bind its suites");
  return value;
}

function parsePhase7Record(value) {
  if (!exactKeys(value, ["format", "version", "counts", "releaseState"])
    || value.format !== "blog-x-phase7-browser-result" || value.version !== 1 || value.releaseState !== "BLOCKED") {
    throw new Error("Phase 7 result record has an unsupported format");
  }
  assertCounts(value.counts, "Phase 7 result");
  return value;
}

function countMarker(output, marker) {
  return String(output).replace(/\r\n?/g, "\n").split("\n").filter((line) => line.includes(marker)).length;
}

function layerRecord(runs, records, output) {
  const normalized = normalizedRedactedOutput(output);
  return {
    runs,
    resultSha256: sha256(records.map((record) => JSON.stringify(record)).join("\n")),
    outputSha256: sha256(normalized),
    counts: sumCounts(records.map((record) => record.counts)),
  };
}

export function parseLocalDeliveryAcceptanceRecord(value) {
  if (!exactKeys(value, ["format", "version", "phase6Data", "phase7Browser", "counts", "releaseState"])
    || value.format !== LOCAL_DELIVERY_ACCEPTANCE_FORMAT || value.version !== 1 || value.releaseState !== "BLOCKED") {
    throw new Error("local delivery acceptance result has an unsupported format");
  }
  for (const [label, layer, runs] of [["Phase 6", value.phase6Data, 3], ["Phase 7", value.phase7Browser, 1]]) {
    if (!exactKeys(layer, ["runs", "resultSha256", "outputSha256", "counts"]) || layer.runs !== runs
      || !/^[a-f0-9]{64}$/.test(layer.resultSha256) || !/^[a-f0-9]{64}$/.test(layer.outputSha256)) {
      throw new Error(`${label} acceptance layer is incomplete`);
    }
    assertCounts(layer.counts, `${label} acceptance`);
  }
  const totals = sumCounts([value.phase6Data.counts, value.phase7Browser.counts]);
  assertCounts(value.counts, "local delivery acceptance");
  if (JSON.stringify(totals) !== JSON.stringify(value.counts)) throw new Error("local delivery acceptance totals do not bind layers");
  return value;
}

export function parseLocalDeliveryAcceptanceOutputs({ phase6Output, phase7Output }) {
  assertNoRawSecrets(phase6Output, "Phase 6");
  assertNoRawSecrets(phase7Output, "Phase 7");
  const phase6Lines = String(phase6Output).replace(/\r\n?/g, "\n").split("\n").filter((line) => line.startsWith(phase6Prefix));
  if (phase6Lines.length !== 3) throw new Error("local delivery acceptance requires exactly three Phase 6 result records");
  const phase6Records = phase6Lines.map((line) => parsePhase6Record(JSON.parse(line.slice(phase6Prefix.length))));
  if (new Set(phase6Lines).size !== 1) throw new Error("parallel Phase 6 records have schema or count drift");
  if (countMarker(phase6Output, "LOCAL PHASE 6 DATA PASS; RELEASE BLOCKED") !== 3
    || countMarker(phase6Output, "GENERATED CLEANUP PASS") !== 1
    || countMarker(phase6Output, "GENERATED PARALLEL CLEANUP PASS") !== 2) {
    throw new Error("Phase 6 acceptance cleanup or BLOCKED markers are incomplete");
  }
  const phase7Record = parsePhase7Record(parseOneLine(phase7Output, phase7Prefix, "Phase 7"));
  if (countMarker(phase7Output, "[phase7-browser] PASS") !== 1 || countMarker(phase7Output, "[phase7-browser] CLEANUP PASS") !== 1) {
    throw new Error("Phase 7 acceptance cleanup or pass markers are incomplete");
  }
  const result = {
    format: LOCAL_DELIVERY_ACCEPTANCE_FORMAT,
    version: 1,
    phase6Data: layerRecord(3, phase6Records, phase6Output),
    phase7Browser: layerRecord(1, [phase7Record], phase7Output),
    counts: sumCounts([sumCounts(phase6Records.map((record) => record.counts)), phase7Record.counts]),
    releaseState: "BLOCKED",
  };
  return parseLocalDeliveryAcceptanceRecord(result);
}

function minimalEnvironment() {
  return Object.freeze({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp", LANG: "C" });
}

function runBounded(command, args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd: root, env: minimalEnvironment(), stdio: ["ignore", "pipe", "pipe"] });
    let combined = "";
    let overflow = false;
    const capture = (chunk) => {
      if (overflow) return;
      combined += String(chunk);
      if (Buffer.byteLength(combined) > maximumOutputBytes) {
        overflow = true;
        child.kill("SIGTERM");
      }
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const timer = setTimeout(() => child.kill("SIGTERM"), childTimeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (overflow) return reject(new Error("local delivery acceptance child exceeded bounded output"));
      if (exitCode !== 0 || signal !== null) return reject(new Error("local delivery acceptance child did not complete successfully"));
      resolveResult(combined);
    });
  });
}

export async function runLocalDeliveryAcceptance(...args) {
  if (args.length) throw new Error("local delivery acceptance accepts zero arguments only");
  const phase6Output = await runBounded(process.execPath, ["scripts/local-verify.mjs", "--phase6-data", "--interruption-check", "--parallel-check"]);
  const phase7Output = await runBounded(process.execPath, ["scripts/phase7-browser-verify.mjs"]);
  const result = parseLocalDeliveryAcceptanceOutputs({ phase6Output, phase7Output });
  process.stdout.write(`${acceptancePrefix}${JSON.stringify(result)}\n`);
  process.stdout.write("[local-delivery-acceptance] PASS; RELEASE BLOCKED\n");
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  runLocalDeliveryAcceptance(...process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
