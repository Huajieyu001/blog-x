import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  LOCAL_DELIVERY_ACCEPTANCE_FORMAT,
  parseLocalDeliveryAcceptanceOutputs,
  parseLocalDeliveryAcceptanceRecord,
  runLocalDeliveryAcceptance,
} from "./local-delivery-acceptance.mjs";
import { createLocalDeliveryAcceptanceTestRuntime } from "./local-delivery-acceptance-test-core.mjs";
import { createPhase6DataResult, phase6Selection } from "./local-verify.mjs";

const counts = { tests: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
const phase6Result = createPhase6DataResult([
  ...phase6Selection("data").databaseSuites.map(([, id]) => ({ id, kind: "database", counts })),
  ...phase6Selection("data").nodeSuites.map((id) => ({ id, kind: "node", counts })),
  { id: phase6Selection("data").boundarySuite, kind: "boundary", counts },
]);
const phase7Result = { format: "blog-x-phase7-browser-result", version: 1, counts, releaseState: "BLOCKED" };
const phase6Output = [
  ...Array.from({ length: 3 }, () => `BLOG X PHASE6 DATA RESULT ${JSON.stringify(phase6Result)}`),
  ...Array.from({ length: 3 }, () => "[local-verify] LOCAL PHASE 6 DATA PASS; RELEASE BLOCKED"),
  "[local-verify] GENERATED CLEANUP PASS",
  ...Array.from({ length: 2 }, () => "[local-verify] GENERATED PARALLEL CLEANUP PASS"),
].join("\n");
const phase7Output = [
  `BLOG X PHASE7 BROWSER RESULT ${JSON.stringify(phase7Result)}`,
  "[phase7-browser] PASS",
  "[phase7-browser] CLEANUP PASS",
].join("\n");

test("local delivery acceptance only accepts complete BLOCKED Phase 6/7 records and binds sanitized digests", () => {
  const result = parseLocalDeliveryAcceptanceOutputs({ phase6Output, phase7Output });
  assert.equal(LOCAL_DELIVERY_ACCEPTANCE_FORMAT, "blog-x-v1.1-local-delivery-acceptance");
  assert.equal(result.format, LOCAL_DELIVERY_ACCEPTANCE_FORMAT);
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.phase6Data.runs, 3);
  assert.equal(result.phase7Browser.runs, 1);
  assert.match(result.phase6Data.resultSha256, /^[a-f0-9]{64}$/);
  assert.match(result.phase7Browser.outputSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.keys(result).sort().join(","), "counts,format,phase6Data,phase7Browser,releaseState,version");
  assert.deepEqual(parseLocalDeliveryAcceptanceRecord(result), result);
});

test("local delivery acceptance rejects incomplete, stale, non-pass, unclean, and secret-bearing evidence", () => {
  const rawDatabaseUrl = ["postgres://user", "password@host/db"].join(":");
  const replacements = [
    [phase6Output.replace(/BLOG X PHASE6 DATA RESULT.*\n/, ""), phase7Output, /three|record/i],
    [phase6Output.replace("GENERATED PARALLEL CLEANUP PASS", ""), phase7Output, /cleanup/i],
    [phase6Output, phase7Output.replace('"version":1', '"version":2'), /format|version/i],
    [phase6Output, phase7Output.replace("CLEANUP PASS", "CLEANUP FAIL"), /cleanup/i],
    [`${phase6Output}\n${rawDatabaseUrl}`, phase7Output, /secret|credential|database/i],
    [phase6Output, `${phase7Output}\nBLOG X PHASE7 BROWSER RESULT ${JSON.stringify(phase7Result)}`, /exactly one/i],
    [phase6Output.replace('"tests":3,"passed":3', '"tests":0,"passed":0'), phase7Output, /zero|pass-only/i],
    [phase6Output.replace('"failed":0', '"failed":1'), phase7Output, /pass-only|counts/i],
    [phase6Output.replace('"skipped":0', '"skipped":1'), phase7Output, /pass-only|counts/i],
    [phase6Output.replace('"todo":0', '"todo":1'), phase7Output, /pass-only|counts/i],
  ];
  for (const [badPhase6, badPhase7, matcher] of replacements) {
    assert.throws(() => parseLocalDeliveryAcceptanceOutputs({ phase6Output: badPhase6, phase7Output: badPhase7 }), matcher);
  }
});

test("test-only runtime records the only two sealed child argv families and rejects child failures", async () => {
  const calls = [];
  const runtime = createLocalDeliveryAcceptanceTestRuntime({
    processBoundary: async (command, args) => {
      calls.push({ command, args });
      return { exitCode: 0, signal: null, combined: args[0]?.endsWith("local-verify.mjs") ? phase6Output : phase7Output };
    },
  });
  const result = await runtime.run();
  assert.equal(result.phase6Data.runs, 3);
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    [process.execPath, ["scripts/local-verify.mjs", "--phase6-data", "--interruption-check", "--parallel-check"]],
    [process.execPath, ["scripts/phase7-browser-verify.mjs"]],
  ]);
  for (const result of [
    { exitCode: 1, signal: null, combined: "" },
    { exitCode: 0, signal: "SIGTERM", combined: "" },
    { exitCode: 0, signal: null, combined: "", timedOut: true },
    { exitCode: 0, signal: null, combined: "", overflow: true },
  ]) {
    await assert.rejects(createLocalDeliveryAcceptanceTestRuntime({ processBoundary: async () => result }).run(), /child|complete/i);
  }
});

test("production coordinator is sealed, zero-argument, and has no test-core, canonical-data, or remote authority", async () => {
  const source = await readFile(join(process.cwd(), "scripts/local-delivery-acceptance.mjs"), "utf8");
  assert.match(source, /export async function runLocalDeliveryAcceptance\(\.\.\.args\)/);
  assert.match(source, /args\.length/);
  assert.doesNotMatch(source, /local-delivery-acceptance-test-core|createLocalDeliveryAcceptanceTestRuntime|blogxlocal|docker-compose|migration|cutover|\b(?:ssh|scp|rsync|fetch\()/i);
  assert.match(source, /scripts\/local-verify\.mjs[\s\S]*--phase6-data[\s\S]*--interruption-check[\s\S]*--parallel-check/);
  assert.match(source, /scripts\/phase7-browser-verify\.mjs/);
  assert.doesNotMatch(source, /grep/);
  assert.match(source, /maximumOutputBytes/);
  assert.match(source, /childTimeoutMs/);
  await assert.rejects(runLocalDeliveryAcceptance("--partial"), /zero arguments/i);
});
