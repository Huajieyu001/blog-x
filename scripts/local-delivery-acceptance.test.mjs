import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer, connect } from "node:net";
import test from "node:test";
import {
  LOCAL_DELIVERY_ACCEPTANCE_FORMAT,
  parseLocalDeliveryAcceptanceOutputs,
  parseLocalDeliveryAcceptanceRecord,
  runLocalDeliveryAcceptance,
} from "./local-delivery-acceptance.mjs";
import { createLocalDeliveryAcceptanceTestRuntime } from "./local-delivery-acceptance-test-core.mjs";
import { createPhase6DataResult, phase6Selection } from "./local-verify.mjs";
import { runBoundedChildTree } from "./local-delivery-child-tree.mjs";

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

test("local delivery acceptance rejects incomplete, stale, non-pass, and unclean evidence", () => {
  const replacements = [
    [phase6Output.replace(/BLOG X PHASE6 DATA RESULT.*\n/, ""), phase7Output, /three|record/i],
    [phase6Output.replace("GENERATED PARALLEL CLEANUP PASS", ""), phase7Output, /cleanup/i],
    [phase6Output, phase7Output.replace('"version":1', '"version":2'), /format|version/i],
    [phase6Output, phase7Output.replace("CLEANUP PASS", "CLEANUP FAIL"), /cleanup/i],
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

test("structured JSON colon Bearer and Cookie secrets are redacted before stable output hashing", () => {
  const firstDatabaseUrl = ["postgres://user", "alpha-password@host/db"].join(":");
  const secondDatabaseUrl = ["postgres://user", "beta-password@host/db"].join(":");
  const variants = [
    ['{"password":"alpha-json"}', '{"password":"beta-json"}'],
    ["token: alpha-colon", "token: beta-colon"],
    ["Authorization: Bearer alpha-bearer", "Authorization: Bearer beta-bearer"],
    ["Cookie: account=alpha-cookie; preference=alpha-pref", "Cookie: account=beta-cookie; preference=beta-pref"],
    ["Set-Cookie: account=alpha-cookie; HttpOnly=true", "Set-Cookie: account=beta-cookie; HttpOnly=false"],
    [firstDatabaseUrl, secondDatabaseUrl],
  ];
  for (const [firstSecret, secondSecret] of variants) {
    const first = parseLocalDeliveryAcceptanceOutputs({ phase6Output: `${phase6Output}\n${firstSecret}`, phase7Output });
    const second = parseLocalDeliveryAcceptanceOutputs({ phase6Output: `${phase6Output}\n${secondSecret}`, phase7Output });
    assert.equal(first.phase6Data.outputSha256, second.phase6Data.outputSha256, firstSecret);
    assert.deepEqual(first.phase6Data.counts, second.phase6Data.counts);
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
  const phase6Source = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  const phase7Source = await readFile(join(process.cwd(), "scripts/phase7-browser-verify.mjs"), "utf8");
  assert.match(source, /export async function runLocalDeliveryAcceptance\(\.\.\.args\)/);
  assert.match(source, /args\.length/);
  assert.doesNotMatch(source, /local-delivery-acceptance-test-core|createLocalDeliveryAcceptanceTestRuntime|blogxlocal|docker-compose|migration|cutover|\b(?:ssh|scp|rsync|fetch\()/i);
  assert.match(source, /scripts\/local-verify\.mjs[\s\S]*--phase6-data[\s\S]*--interruption-check[\s\S]*--parallel-check/);
  assert.match(source, /scripts\/phase7-browser-verify\.mjs/);
  assert.doesNotMatch(source, /grep/);
  assert.match(source, /maximumOutputBytes/);
  assert.match(source, /childTimeoutMs/);
  assert.match(source, /runBoundedChildTree/);
  assert.match(phase6Source, /installCooperativeShutdown[\s\S]*allowDuringShutdown[\s\S]*confirmGeneratedProjectAbsent/);
  assert.match(phase7Source, /installCooperativeShutdown[\s\S]*signalCleanupPromise[\s\S]*stopExactChildren/);
  await assert.rejects(runLocalDeliveryAcceptance("--partial"), /zero arguments/i);
});

async function freePort() {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("unable to allocate helper port"));
      server.close(() => accept(address.port));
    });
  });
}

async function portIsClosed(port) {
  return new Promise((accept) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); accept(false); });
    socket.once("error", () => accept(true));
  });
}

test("production bounded controller kills an exact TERM-ignoring helper tree and closes its generated authority", { skip: process.platform === "win32" }, async () => {
  const port = await freePort(); const output = []; const started = Date.now();
  await assert.rejects(runBoundedChildTree(process.execPath, ["scripts/fixtures/local-delivery-child-tree-helper.mjs", String(port)], {
    cwd: process.cwd(), env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp", LANG: "C" },
    maximumOutputBytes: 64 * 1024, timeoutMs: 750, terminationGraceMs: 150, killGraceMs: 2_000,
    onOutput(value) { output.push(value); },
  }), /bounded time.*cleanup confirmed/i);
  assert.ok(Date.now() - started < 4_000, "controller must settle inside its advertised timeout and kill grace");
  const combined = output.join("");
  assert.match(combined, /PARENT_READY \d+/);
  const descendantPid = Number(/DESCENDANT_READY (\d+)/.exec(combined)?.[1]);
  assert.ok(Number.isSafeInteger(descendantPid));
  assert.equal(await portIsClosed(port), true, "generated listener remained reachable");
  assert.throws(() => process.kill(descendantPid, 0), (error) => error?.code === "ESRCH");
});
