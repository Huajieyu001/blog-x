import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BOUNDED_CHILD_FAILURE_KINDS, runBoundedChildTree } from "./local-delivery-child-tree.mjs";
import { createGeneratedIntegrationResult } from "./local-verify.mjs";
import { validatePhase7BrowserResult } from "./phase7-browser-verify.mjs";
import { DEFAULT_TEST_FILES, INTEGRATION_TEST_FILES, PACKAGE_TEST_INVENTORY } from "./test-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);
const maximumOutputBytes = 8 * 1024 * 1024;
const childTimeoutMs = 20 * 60_000;
const childTerminationGraceMs = 5_000;
const childKillGraceMs = 3_000;
const generatedIntegrationPrefix = "BLOG X GENERATED INTEGRATION RESULT ";
const phase7Prefix = "BLOG X PHASE7 BROWSER RESULT ";
const generatedIntegrationCleanupPrefix = "BLOG X GENERATED INTEGRATION CLEANUP ACK ";
const phase7CleanupPrefix = "BLOG X PHASE7 CLEANUP ACK ";
const acceptancePrefix = "BLOG X V1.1 ACCEPTANCE RESULT ";
const acceptanceFailurePrefix = "BLOG X V1.1 ACCEPTANCE FAILURE ";

const acceptanceStages = Object.freeze(["generated", "phase7"]);
export const ACCEPTANCE_FAILURE_CLASSES = Object.freeze(acceptanceStages.flatMap((stage) => BOUNDED_CHILD_FAILURE_KINDS.map((kind) => `${stage}_${kind}`)));
const safeSignals = Object.freeze(["SIGABRT", "SIGHUP", "SIGINT", "SIGKILL", "SIGQUIT", "SIGTERM"]);

export const LOCAL_DELIVERY_ACCEPTANCE_FORMAT = "blog-x-v1.1-local-delivery-acceptance";

function safeExitCode(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 255 ? value : null; }
function safeSignal(value) { return safeSignals.includes(value) ? value : null; }

export function buildLocalDeliveryAcceptanceEnvironment(ambient = process.env) {
  if (!ambient || typeof ambient !== "object" || Array.isArray(ambient)) throw new Error("local delivery acceptance environment authority is invalid");
  const output = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]) if (typeof ambient[key] === "string" && ambient[key]) output[key] = ambient[key];
  if (!output.TMPDIR) output.TMPDIR = "/tmp";
  if (!output.LANG) output.LANG = "C";
  return Object.freeze(output);
}

export function wrapLocalDeliveryAcceptanceFailure(stage, error) {
  if (!acceptanceStages.includes(stage) || !BOUNDED_CHILD_FAILURE_KINDS.includes(error?.boundedFailureKind)) {
    throw new Error("local delivery acceptance failure classification is invalid");
  }
  const acceptanceFailureClass = `${stage}_${error.boundedFailureKind}`;
  if (!ACCEPTANCE_FAILURE_CLASSES.includes(acceptanceFailureClass)) throw new Error("local delivery acceptance failure class is invalid");
  const wrapped = new Error(`local delivery acceptance ${stage} child failed`);
  Object.defineProperties(wrapped, {
    acceptanceFailureClass: { value: acceptanceFailureClass },
    boundedExitCode: { value: safeExitCode(error.boundedExitCode) },
    boundedSignal: { value: safeSignal(error.boundedSignal) },
  });
  return wrapped;
}

export function formatLocalDeliveryAcceptanceFailure(error) {
  if (!ACCEPTANCE_FAILURE_CLASSES.includes(error?.acceptanceFailureClass)) throw new Error("local delivery acceptance failure is not typed");
  const record = {
    format: "blog-x-v1.1-local-delivery-acceptance-failure",
    version: 1,
    acceptanceFailureClass: error.acceptanceFailureClass,
    exitCode: safeExitCode(error.boundedExitCode),
    signal: safeSignal(error.boundedSignal),
  };
  return `${acceptanceFailurePrefix}${JSON.stringify(record)}\n`;
}

export function parseLocalDeliveryAcceptanceFailure(output) {
  const lines = String(output).replace(/\r\n?/g, "\n").split("\n").filter((line) => line.startsWith(acceptanceFailurePrefix));
  if (lines.length !== 1) throw new Error("local delivery acceptance failure output must contain exactly one record");
  let record;
  try { record = JSON.parse(lines[0].slice(acceptanceFailurePrefix.length)); } catch { throw new Error("local delivery acceptance failure record is invalid"); }
  if (!exactKeys(record, ["acceptanceFailureClass", "exitCode", "format", "signal", "version"])
    || record.format !== "blog-x-v1.1-local-delivery-acceptance-failure" || record.version !== 1
    || !ACCEPTANCE_FAILURE_CLASSES.includes(record.acceptanceFailureClass)
    || record.exitCode !== null && safeExitCode(record.exitCode) !== record.exitCode
    || record.signal !== null && safeSignal(record.signal) !== record.signal) {
    throw new Error("local delivery acceptance failure record is invalid");
  }
  return structuredClone(record);
}

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
  const secretKey = String.raw`(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)`;
  const structuredKey = String.raw`(?:${secretKey}|authorization|(?:set-)?cookie)`;
  let output = String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r\n?/g, "\n")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(blog_x_session=)[^;\s]+/gi, "$1[REDACTED]")
    .replace(/(\bauthorization\s*[=:]\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(^|\n)(authorization\s*:\s*)[^\n]*/gi, "$1$2[REDACTED]");
  output = output
    .replace(new RegExp(`("${structuredKey}"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, "gi"), '$1"[REDACTED]"')
    .replace(new RegExp(`(\\b${secretKey}\\b\\s*:\\s*)(?:"(?:\\\\.|[^"\\\\])*"|'[^'\\r\\n]*'|[^\\s,;}]+)`, "gi"), "$1[REDACTED]")
    .replace(new RegExp(`(\\b${secretKey}\\b\\s*=\\s*)(?:"(?:\\\\.|[^"\\\\])*"|'[^'\\r\\n]*'|[^\\s,;}]+)`, "gi"), "$1[REDACTED]");
  output = output.split("\n").map((line) => {
    const match = /^(.*?)(\b(?:set-)?cookie\s*:\s*)(.*)$/i.exec(line);
    if (!match) return line;
    let foundPair = false;
    const redacted = match[3].split(";").map((part) => part.replace(/^(\s*[^=;\s]+\s*=\s*).*$/, (_, key) => {
      foundPair = true;
      return `${key}[REDACTED]`;
    })).join(";");
    return `${match[1]}${match[2]}${foundPair ? redacted : "[REDACTED]"}`;
  }).join("\n");
  assertNoRawSecrets(output, "normalized acceptance");
  return output;
}

function assertNoRawSecrets(value, label) {
  const output = String(value);
  const secretKey = String.raw`(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)`;
  const structuredKey = String.raw`(?:${secretKey}|authorization|(?:set-)?cookie)`;
  if (/postgres(?:ql)?:\/\/[^\s]+/i.test(output)
    || /blog_x_session=(?!\[REDACTED\])[^;\s]+/i.test(output)
    || /\bauthorization\s*[=:]\s*bearer(?!\s+\[REDACTED\])\s+/i.test(output)
    || new RegExp(`"${structuredKey}"\\s*:\\s*"(?!\\[REDACTED\\])`, "i").test(output)
    || new RegExp(`\\b${secretKey}\\b\\s*[=:](?!\\s*\\[REDACTED\\])`, "i").test(output)
    || output.split("\n").map((line) => /\b(?:set-)?cookie\s*:\s*(.*)$/i.exec(line)?.[1]).filter((body) => body !== undefined)
      .some((body) => body !== "[REDACTED]" && body.split(";").some((part) => /=/.test(part) && !/=\s*\[REDACTED\]\s*$/.test(part)))) {
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

export function assertGeneratedIntegrationCleanupAcknowledgement(output, { requireFour = false } = {}) {
  const value = parseOneLine(output, generatedIntegrationCleanupPrefix, "generated integration cleanup acknowledgement");
  if (!exactKeys(value, ["format", "version", "namespaces", "releaseState"])
    || value.format !== "blog-x-generated-integration-cleanup" || value.version !== 1 || value.releaseState !== "BLOCKED"
    || !Array.isArray(value.namespaces) || value.namespaces.length < 1 || requireFour && value.namespaces.length !== 4) {
    throw new Error("generated integration cleanup acknowledgement is incomplete");
  }
  const seen = new Set();
  for (const authority of value.namespaces) {
    if (!exactKeys(authority, ["namespace", "containersAbsent", "volumesAbsent", "pathsAbsent"])
      || !/^blogxverify_[a-z0-9]{8,32}$/.test(authority.namespace) || seen.has(authority.namespace)
      || authority.containersAbsent !== true || authority.volumesAbsent !== true || authority.pathsAbsent !== true) {
      throw new Error("generated integration cleanup acknowledgement authority is invalid");
    }
    seen.add(authority.namespace);
  }
  return value;
}

export function assertPhase7CleanupAcknowledgement(output, { requireOrigins = false } = {}) {
  const value = parseOneLine(output, phase7CleanupPrefix, "Phase 7 cleanup acknowledgement");
  const webRoot = typeof value?.webRoot === "string" ? resolve(value.webRoot) : "";
  const generatedRootParent = resolve(root, "apps");
  if (!exactKeys(value, ["childrenAbsent", "format", "origins", "releaseState", "rootAbsent", "version", "webRoot"])
    || value.format !== "blog-x-phase7-cleanup-ack" || value.version !== 1 || value.releaseState !== "BLOCKED"
    || value.childrenAbsent !== true || value.rootAbsent !== true || typeof value.webRoot !== "string"
    || webRoot !== value.webRoot || dirname(webRoot) !== generatedRootParent
    || !/^\.phase7-web-[A-Za-z0-9_-]{6,64}$/.test(basename(webRoot)) || !Array.isArray(value.origins)
    || requireOrigins && value.origins.length !== 2 || ![0, 2].includes(value.origins.length)) {
    throw new Error("Phase 7 cleanup acknowledgement is incomplete");
  }
  const origins = value.origins.map((origin) => {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error("Phase 7 cleanup origin is invalid"); }
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.port || parsed.pathname !== "/") throw new Error("Phase 7 cleanup origin is invalid");
    return parsed.origin;
  });
  if (new Set(origins).size !== origins.length) throw new Error("Phase 7 cleanup origins are duplicated");
  return value;
}

function parseGeneratedIntegrationRecord(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.suites)) throw new Error("generated integration result schema is invalid");
  const canonical = createGeneratedIntegrationResult({ suites: value.suites, cleanup: value.cleanup, probes: value.probes });
  if (JSON.stringify(value) !== JSON.stringify(canonical)) throw new Error("generated integration result digest manifest or schema drifted");
  if (canonical.probes.length !== 2
    || canonical.probes[0]?.kind !== "interruption" || canonical.probes[0]?.interrupted !== true
    || canonical.probes[1]?.kind !== "parallel" || canonical.probes[1]?.interrupted !== false) {
    throw new Error("generated integration lifecycle probes are incomplete");
  }
  return canonical;
}

function parsePhase7Record(value) {
  return validatePhase7BrowserResult(value);
}

function countMarker(output, marker) {
  return String(output).replace(/\r\n?/g, "\n").split("\n").filter((line) => line.includes(marker)).length;
}

function layerRecord(record, output) {
  const normalized = normalizedRedactedOutput(output);
  return {
    runs: 1,
    manifestSha256: record.manifestSha256,
    inventory: [...record.inventory],
    resultSha256: record.resultSha256,
    outputSha256: sha256(normalized),
    counts: { ...record.counts },
    cleanupAcknowledged: true,
  };
}

export function parseLocalDeliveryAcceptanceRecord(value) {
  if (!exactKeys(value, ["format", "version", "manifestSha256", "inventory", "generatedIntegration", "phase7Browser", "counts", "resultSha256", "releaseState"])
    || value.format !== LOCAL_DELIVERY_ACCEPTANCE_FORMAT || value.version !== 2 || value.releaseState !== "BLOCKED") {
    throw new Error("local delivery acceptance result has an unsupported format");
  }
  const manifestSha256 = sha256(JSON.stringify(PACKAGE_TEST_INVENTORY));
  const integrationInventory = [...INTEGRATION_TEST_FILES].sort();
  if (value.manifestSha256 !== manifestSha256 || JSON.stringify(value.inventory) !== JSON.stringify(integrationInventory)
    || new Set(value.inventory).size !== integrationInventory.length
    || new Set([...DEFAULT_TEST_FILES, ...value.inventory]).size !== PACKAGE_TEST_INVENTORY.length) {
    throw new Error("local delivery acceptance inventory or manifest is incomplete duplicated or drifted");
  }
  for (const [label, layer] of [["generated integration", value.generatedIntegration], ["Phase 7", value.phase7Browser]]) {
    if (!exactKeys(layer, ["runs", "manifestSha256", "inventory", "resultSha256", "outputSha256", "counts", "cleanupAcknowledged"])
      || layer.runs !== 1 || layer.manifestSha256 !== manifestSha256 || layer.cleanupAcknowledged !== true
      || !Array.isArray(layer.inventory) || new Set(layer.inventory).size !== layer.inventory.length
      || !/^[a-f0-9]{64}$/.test(layer.resultSha256) || !/^[a-f0-9]{64}$/.test(layer.outputSha256)) {
      throw new Error(`${label} acceptance layer is incomplete`);
    }
    assertCounts(layer.counts, `${label} acceptance`);
  }
  const union = [...value.generatedIntegration.inventory, ...value.phase7Browser.inventory].sort();
  if (JSON.stringify(union) !== JSON.stringify(integrationInventory) || new Set(union).size !== union.length) {
    throw new Error("local delivery acceptance layer inventory is missing duplicated or contains extras");
  }
  const totals = sumCounts([value.generatedIntegration.counts, value.phase7Browser.counts]);
  assertCounts(value.counts, "local delivery acceptance");
  if (JSON.stringify(totals) !== JSON.stringify(value.counts)) throw new Error("local delivery acceptance totals do not bind layers");
  const { resultSha256, ...body } = value;
  if (resultSha256 !== sha256(JSON.stringify(body))) throw new Error("local delivery acceptance result digest is invalid");
  return structuredClone(value);
}

export function parseLocalDeliveryAcceptanceOutputs({ generatedIntegrationOutput, phase7Output }) {
  const generatedRecord = parseGeneratedIntegrationRecord(parseOneLine(generatedIntegrationOutput, generatedIntegrationPrefix, "generated integration"));
  if (countMarker(generatedIntegrationOutput, "LOCAL CANONICAL INTEGRATION PASS; RELEASE BLOCKED") !== 1) {
    throw new Error("generated integration acceptance pass marker is incomplete");
  }
  const generatedCleanup = assertGeneratedIntegrationCleanupAcknowledgement(generatedIntegrationOutput, { requireFour: true });
  const producerNamespaces = [generatedRecord.cleanup.namespace, ...generatedRecord.probes.flatMap((probe) => probe.namespaces)].sort();
  if (JSON.stringify(generatedCleanup.namespaces.map((entry) => entry.namespace).sort()) !== JSON.stringify(producerNamespaces)) {
    throw new Error("generated integration cleanup does not bind all lifecycle authorities");
  }
  const phase7Record = parsePhase7Record(parseOneLine(phase7Output, phase7Prefix, "Phase 7"));
  if (countMarker(phase7Output, "[phase7-browser] PASS") !== 1 || countMarker(phase7Output, "[phase7-browser] CLEANUP PASS") !== 1) {
    throw new Error("Phase 7 acceptance cleanup or pass markers are incomplete");
  }
  assertPhase7CleanupAcknowledgement(phase7Output, { requireOrigins: true });
  const body = {
    format: LOCAL_DELIVERY_ACCEPTANCE_FORMAT,
    version: 2,
    manifestSha256: sha256(JSON.stringify(PACKAGE_TEST_INVENTORY)),
    inventory: [...INTEGRATION_TEST_FILES].sort(),
    generatedIntegration: layerRecord(generatedRecord, generatedIntegrationOutput),
    phase7Browser: layerRecord(phase7Record, phase7Output),
    counts: sumCounts([generatedRecord.counts, phase7Record.counts]),
    releaseState: "BLOCKED",
  };
  const result = { ...body, resultSha256: sha256(JSON.stringify(body)) };
  return parseLocalDeliveryAcceptanceRecord(result);
}

function runBounded(command, args, confirmCleanup) {
  return runBoundedChildTree(command, args, {
    cwd: root,
    env: buildLocalDeliveryAcceptanceEnvironment(),
    maximumOutputBytes,
    timeoutMs: childTimeoutMs,
    terminationGraceMs: childTerminationGraceMs,
    killGraceMs: childKillGraceMs,
    confirmCleanup,
  });
}

export async function runLocalDeliveryAcceptance(...args) {
  if (args.length) throw new Error("local delivery acceptance accepts zero arguments only");
  let generatedIntegrationOutput;
  try {
    generatedIntegrationOutput = await runBounded(process.execPath, ["scripts/local-verify.mjs", "--canonical-integration", "--interruption-check", "--parallel-check"], (output) => Boolean(assertGeneratedIntegrationCleanupAcknowledgement(output)));
  } catch (error) {
    throw wrapLocalDeliveryAcceptanceFailure("generated", error);
  }
  let phase7Output;
  try {
    phase7Output = await runBounded(process.execPath, ["scripts/phase7-browser-verify.mjs"], (output) => Boolean(assertPhase7CleanupAcknowledgement(output)));
  } catch (error) {
    throw wrapLocalDeliveryAcceptanceFailure("phase7", error);
  }
  const result = parseLocalDeliveryAcceptanceOutputs({ generatedIntegrationOutput, phase7Output });
  process.stdout.write(`${acceptancePrefix}${JSON.stringify(result)}\n`);
  process.stdout.write("[local-delivery-acceptance] PASS; RELEASE BLOCKED\n");
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  runLocalDeliveryAcceptance(...process.argv.slice(2)).catch((error) => {
    try { process.stderr.write(formatLocalDeliveryAcceptanceFailure(error)); }
    catch { process.stderr.write("BLOG X V1.1 ACCEPTANCE FAILED\n"); }
    process.exitCode = 1;
  });
}
