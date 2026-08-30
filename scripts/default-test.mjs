import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBoundedChildTree } from "./local-delivery-child-tree.mjs";
import { DEFAULT_TEST_FILES, assertCompleteTestInventory } from "./test-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);
const maximumChildOutputBytes = 4 * 1024 * 1024;
const maximumDiagnosticBytes = 64 * 1024;
const childTimeoutMs = 120_000;
const secretKey = String.raw`(?:[A-Za-z0-9]+[_-])*(?:password|passwd|pwd|token|secret|api[_-]?key|auth(?:orization)?|cookie|set[_-]?cookie|database[_-]?url)(?:[_-][A-Za-z0-9]+)*`;

const child = (id, files) => Object.freeze({
  id,
  argv: Object.freeze(["--import", "tsx", "--test", "--test-reporter=tap", ...files]),
});

export const DEFAULT_TEST_CHILDREN = Object.freeze([
  child("contracts", [
    "packages/contracts/src/public-discovery.test.ts",
    "packages/contracts/src/tracer.test.ts",
  ]),
  child("api", [
    "apps/api/test/markdown-renderer.test.ts",
    "apps/api/test/security-hardening.test.ts",
  ]),
  child("web", [
    "apps/web/app/admin/_components/article-editor-recovery.test.ts",
    "apps/web/app/lib/search-discovery.test.ts",
    "apps/web/app/lib/site-metadata.test.ts",
    "apps/web/lib/search-encoding.test.ts",
  ]),
]);

function exactFooter(lines, label, name) {
  const pattern = new RegExp(`^\\s*#\\s*${name}\\s+(\\d+)\\s*$`, "i");
  const values = lines.filter((line) => pattern.test(line)).map((line) => Number(line.replace(pattern, "$1")));
  if (values.length !== 1) throw new Error(`${label} TAP ${name} footer is missing or conflicting`);
  return values[0];
}

export function parseDefaultTapResult(output, label = "default child") {
  const tap = String(output).replace(/\r\n?/g, "\n");
  if (!/^TAP version 13\s*$/m.test(tap)) throw new Error(`${label} output is not TAP version 13`);
  const lines = tap.split("\n");
  const directive = lines.find((line) => /#\s*(?:SKIP|TODO)\b/i.test(line)
    && !/^\s*#\s*(?:skipped|todo)\s+\d+\s*$/i.test(line));
  if (directive) throw new Error(`${label} TAP contains a skip or TODO directive`);

  const tests = exactFooter(lines, label, "tests");
  const passed = exactFooter(lines, label, "pass");
  const failed = exactFooter(lines, label, "fail");
  const cancelled = exactFooter(lines, label, "cancelled");
  const skipped = exactFooter(lines, label, "skipped");
  const todo = exactFooter(lines, label, "todo");
  if (!tests || !passed) throw new Error(`${label} TAP reported zero tests`);
  if (tests !== passed + failed + cancelled + skipped + todo) throw new Error(`${label} TAP footer arithmetic is inconsistent`);
  if (failed || cancelled || skipped || todo) throw new Error(`${label} TAP reported a non-pass result`);
  return { tests, passed, failed, cancelled, skipped, todo };
}

export function buildDefaultTestEnvironment(ambient = process.env) {
  if (!ambient || typeof ambient !== "object" || Array.isArray(ambient)) throw new Error("default test environment authority is invalid");
  const required = (name) => typeof ambient[name] === "string" && ambient[name] ? ambient[name] : "";
  return Object.freeze({
    PATH: required("PATH"),
    HOME: required("HOME"),
    TMPDIR: required("TMPDIR") || "/tmp",
    LANG: required("LANG") || "C",
    LC_ALL: required("LC_ALL") || "C",
  });
}

export function redactDefaultTestDiagnostic(value) {
  let output = String(value)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@[^\s"'<>]+/gi, "[REDACTED_URI]")
    .replace(/(\bauthorization\s*:\s*(?:bearer|basic)\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(new RegExp(`("${secretKey}"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, "gi"), '$1"[REDACTED]"');
  output = output
    .replace(new RegExp(`((?:^|[^A-Za-z0-9_-])${secretKey}\\s*[:=]\\s*)(?:"(?:\\\\.|[^"\\\\])*"|'[^'\\r\\n]*'|[^\\s,;}]+)`, "gi"), "$1[REDACTED]")
    .split("\n").map((line) => {
      const match = /^(.*?\b(?:set-)?cookie\s*:\s*)(.*)$/i.exec(line);
      return match ? `${match[1]}[REDACTED]` : line;
    }).join("\n");
  return output;
}

function boundedDiagnostic(value) {
  const redacted = Buffer.from(redactDefaultTestDiagnostic(value));
  if (redacted.length <= maximumDiagnosticBytes) return redacted.toString("utf8");
  return redacted.subarray(redacted.length - maximumDiagnosticBytes).toString("utf8");
}

export function validateDefaultTestChildResult(id, result) {
  if (!result || typeof result !== "object" || result.exitCode !== 0 || result.signal !== null || result.truncated === true) {
    const marker = result?.truncated === true ? "\n[output truncated at the bounded capture limit]" : "";
    throw new Error(`default test child ${id} failed${marker}\n${boundedDiagnostic(result?.output ?? "child produced no diagnostic output")}`);
  }
  return parseDefaultTapResult(result.output, id);
}

async function runChildProcess(definition) {
  let captured = "";
  try {
    const output = await runBoundedChildTree(process.execPath, definition.argv, {
      cwd: root,
      env: buildDefaultTestEnvironment(),
      maximumOutputBytes: maximumChildOutputBytes,
      timeoutMs: childTimeoutMs,
      terminationGraceMs: 5_000,
      killGraceMs: 3_000,
      onOutput(value) { captured += value; },
    });
    return { exitCode: 0, signal: null, output, truncated: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      signal: null,
      output: `${captured}${captured && !captured.endsWith("\n") ? "\n" : ""}${reason}`,
      truncated: /exceeded bounded output/i.test(reason),
    };
  }
}

function sumCounts(layers) {
  return layers.reduce((total, layer) => {
    for (const key of ["tests", "passed", "failed", "cancelled", "skipped", "todo"]) total[key] += layer.counts[key];
    return total;
  }, { tests: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
}

function assertSealedAuthority() {
  const overridden = Object.keys(process.env).filter((name) => name.startsWith("BLOG_X_DEFAULT_TEST_")).sort();
  if (overridden.length) throw new Error(`default test environment overrides are forbidden: ${overridden.join(",")}`);
  const selected = DEFAULT_TEST_CHILDREN.flatMap((definition) => definition.argv.filter((value) => value.endsWith(".test.ts")));
  if (JSON.stringify(selected) !== JSON.stringify(DEFAULT_TEST_FILES)) throw new Error("default test child selection drifted from the exact inventory");
}

export async function runDefaultTests() {
  if (arguments.length !== 0) throw new Error("default test coordinator accepts no arguments");
  assertSealedAuthority();
  const inventory = await assertCompleteTestInventory();
  const layers = [];
  for (const definition of DEFAULT_TEST_CHILDREN) {
    process.stdout.write(`[default-test] run ${definition.id}\n`);
    const counts = validateDefaultTestChildResult(definition.id, await runChildProcess(definition));
    process.stdout.write(`[default-test] ${definition.id} ${counts.passed}/${counts.tests} pass; 0 failed/cancelled/skipped/TODO\n`);
    layers.push({ id: definition.id, counts });
  }
  const counts = sumCounts(layers);
  if (!counts.tests || counts.tests !== counts.passed || counts.failed || counts.cancelled || counts.skipped || counts.todo) {
    throw new Error("default test aggregate is empty or not pass-only");
  }
  return {
    format: "blog-x-default-test-result",
    version: 1,
    inventory,
    layers,
    counts,
    releaseState: "BLOCKED",
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error("default test coordinator accepts no arguments");
  const result = await runDefaultTests();
  process.stdout.write(`BLOG X DEFAULT TEST RESULT ${JSON.stringify(result)}\n`);
  process.stdout.write(`[default-test] PASS ${result.counts.passed}/${result.counts.tests}; RELEASE BLOCKED\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(redactDefaultTestDiagnostic(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
