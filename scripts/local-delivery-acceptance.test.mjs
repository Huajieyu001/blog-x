import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer, connect } from "node:net";
import test from "node:test";
import {
  ACCEPTANCE_FAILURE_CLASSES,
  LOCAL_DELIVERY_ACCEPTANCE_FORMAT,
  assertGeneratedIntegrationCleanupAcknowledgement,
  assertPhase7CleanupAcknowledgement,
  buildLocalDeliveryAcceptanceEnvironment,
  formatLocalDeliveryAcceptanceFailure,
  parseLocalDeliveryAcceptanceOutputs,
  parseLocalDeliveryAcceptanceFailure,
  parseLocalDeliveryAcceptanceRecord,
  runLocalDeliveryAcceptance,
} from "./local-delivery-acceptance.mjs";
import { createLocalDeliveryAcceptanceTestRuntime } from "./local-delivery-acceptance-test-core.mjs";
import { canonicalIntegrationSelection, createGeneratedIntegrationResult, createLifecycleProbeResult } from "./local-verify.mjs";
import { createPhase7BrowserResult, phase7BrowserSelection } from "./phase7-browser-verify.mjs";
import { PACKAGE_TEST_INVENTORY } from "./test-inventory.mjs";
import { BOUNDED_CHILD_FAILURE_KINDS, runBoundedChildTree } from "./local-delivery-child-tree.mjs";

const counts = { tests: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
const generatedSelection = canonicalIntegrationSelection();
const generatedResult = createGeneratedIntegrationResult({
  suites: generatedSelection.paths.map((path) => ({
    path,
    fixtureOwner: PACKAGE_TEST_INVENTORY.find((entry) => entry.path === path).fixtureOwner,
    counts,
  })),
  cleanup: { namespace: "blogxverify_aaaaaaaaaaaa", containersAbsent: true, volumesAbsent: true, pathsAbsent: true },
  probes: [
    createLifecycleProbeResult({ kind: "interruption", namespaces: ["blogxverify_bbbbbbbbbbbb"], interrupted: true }),
    createLifecycleProbeResult({ kind: "parallel", namespaces: ["blogxverify_cccccccccccc", "blogxverify_dddddddddddd"], interrupted: false }),
  ],
});
const phase7Result = createPhase7BrowserResult({
  inventory: phase7BrowserSelection().inventory,
  counts,
  cleanup: { childrenAbsent: true, originsAbsent: true, webRootAbsent: true },
});
const generatedOutput = [
  `BLOG X GENERATED INTEGRATION RESULT ${JSON.stringify(generatedResult)}`,
  "[local-verify] LOCAL CANONICAL INTEGRATION PASS; RELEASE BLOCKED",
  `BLOG X GENERATED INTEGRATION CLEANUP ACK ${JSON.stringify({ format: "blog-x-generated-integration-cleanup", version: 1, namespaces: ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc", "dddddddddddd"].map((suffix) => ({ namespace: `blogxverify_${suffix}`, containersAbsent: true, volumesAbsent: true, pathsAbsent: true })), releaseState: "BLOCKED" })}`,
].join("\n");
const phase7Output = [
  `BLOG X PHASE7 BROWSER RESULT ${JSON.stringify(phase7Result)}`,
  "[phase7-browser] PASS",
  `BLOG X PHASE7 CLEANUP ACK ${JSON.stringify({ format: "blog-x-phase7-cleanup-ack", version: 1, webRoot: join(process.cwd(), "apps/.phase7-web-fixture"), origins: ["http://127.0.0.1:41001", "http://127.0.0.1:41002"], childrenAbsent: true, rootAbsent: true, releaseState: "BLOCKED" })}`,
  "[phase7-browser] CLEANUP PASS",
].join("\n");

test("local delivery acceptance binds the exact complete integration inventory once", () => {
  const result = parseLocalDeliveryAcceptanceOutputs({ generatedIntegrationOutput: generatedOutput, phase7Output });
  assert.equal(LOCAL_DELIVERY_ACCEPTANCE_FORMAT, "blog-x-v1.1-local-delivery-acceptance");
  assert.equal(result.format, LOCAL_DELIVERY_ACCEPTANCE_FORMAT);
  assert.equal(result.releaseState, "BLOCKED");
  assert.equal(result.version, 2);
  assert.equal(result.generatedIntegration.runs, 1);
  assert.equal(result.phase7Browser.runs, 1);
  assert.match(result.generatedIntegration.resultSha256, /^[a-f0-9]{64}$/);
  assert.match(result.phase7Browser.outputSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.inventory, PACKAGE_TEST_INVENTORY.filter((entry) => entry.scope === "integration").map((entry) => entry.path).sort());
  assert.equal(new Set(result.inventory).size, 30);
  assert.equal(Object.keys(result).sort().join(","), "counts,format,generatedIntegration,inventory,manifestSha256,phase7Browser,releaseState,resultSha256,version");
  assert.deepEqual(parseLocalDeliveryAcceptanceRecord(result), result);
  assert.equal(assertGeneratedIntegrationCleanupAcknowledgement(generatedOutput, { requireFour: true }).namespaces.length, 4);
  assert.equal(assertPhase7CleanupAcknowledgement(phase7Output, { requireOrigins: true }).origins.length, 2);
});

test("local delivery acceptance rejects missing duplicate extra drifted and coverage-bearing evidence", () => {
  const replacements = [
    [generatedOutput.replace(/BLOG X GENERATED INTEGRATION RESULT.*\n/, ""), phase7Output, /exactly one|record/i],
    [generatedOutput.replace("LOCAL CANONICAL INTEGRATION PASS", "LOCAL CANONICAL INTEGRATION FAIL"), phase7Output, /marker|pass/i],
    [generatedOutput, phase7Output.replace("CLEANUP PASS", "CLEANUP FAIL"), /cleanup/i],
    [generatedOutput, `${phase7Output}\nBLOG X PHASE7 BROWSER RESULT ${JSON.stringify(phase7Result)}`, /exactly one/i],
    [generatedOutput.replace('"tests":3,"passed":3', '"tests":0,"passed":0'), phase7Output, /zero|pass-only|digest/i],
    [generatedOutput.replace('"skipped":0', '"skipped":1'), phase7Output, /pass-only|counts|digest/i],
    [generatedOutput.replace('"inventory":[]', '"inventory":["apps/web/e2e/public-errors.spec.ts"]'), phase7Output, /probe|inventory|coverage/i],
  ];
  for (const [badGenerated, badPhase7, matcher] of replacements) {
    assert.throws(() => parseLocalDeliveryAcceptanceOutputs({ generatedIntegrationOutput: badGenerated, phase7Output: badPhase7 }), matcher);
  }
  const generatedAcknowledgement = generatedOutput.split("\n").find((line) => line.startsWith("BLOG X GENERATED INTEGRATION CLEANUP ACK "));
  assert.ok(generatedAcknowledgement);
  for (const invalid of [
    generatedAcknowledgement.replace("blogxverify_aaaaaaaaaaaa", "blogxlocal"),
    generatedAcknowledgement.replace('"containersAbsent":true', '"containersAbsent":false'),
    `${generatedAcknowledgement}\n${generatedAcknowledgement}`,
  ]) {
    assert.throws(() => assertGeneratedIntegrationCleanupAcknowledgement(invalid), /incomplete|invalid|exactly one/i);
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
    ["  Cookie: account=alpha-indented", "  Cookie: account=beta-indented"],
    ["[info] Cookie: account=alpha-prefixed; preference=alpha-pref", "[info] Cookie: account=beta-prefixed; preference=beta-pref"],
    ["2026-08-21T00:00:00Z response Set-Cookie: account=alpha-log; HttpOnly", "2026-08-21T00:00:00Z response Set-Cookie: account=beta-log; HttpOnly"],
    ['{"set-cookie":"account=alpha-json-cookie; HttpOnly"}', '{"set-cookie":"account=beta-json-cookie; HttpOnly"}'],
    [firstDatabaseUrl, secondDatabaseUrl],
  ];
  for (const [firstSecret, secondSecret] of variants) {
    const first = parseLocalDeliveryAcceptanceOutputs({ generatedIntegrationOutput: `${generatedOutput}\n${firstSecret}`, phase7Output });
    const second = parseLocalDeliveryAcceptanceOutputs({ generatedIntegrationOutput: `${generatedOutput}\n${secondSecret}`, phase7Output });
    assert.equal(first.generatedIntegration.outputSha256, second.generatedIntegration.outputSha256, firstSecret);
    assert.deepEqual(first.generatedIntegration.counts, second.generatedIntegration.counts);
  }
});

test("test-only runtime records the only two sealed child argv families and rejects child failures", async () => {
  const calls = [];
  const runtime = createLocalDeliveryAcceptanceTestRuntime({
    processBoundary: async (command, args) => {
      calls.push({ command, args });
      return { exitCode: 0, signal: null, combined: args[0]?.endsWith("local-verify.mjs") ? generatedOutput : phase7Output };
    },
  });
  const result = await runtime.run();
  assert.equal(result.generatedIntegration.runs, 1);
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    [process.execPath, ["scripts/local-verify.mjs", "--canonical-integration", "--interruption-check", "--parallel-check"]],
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

test("bounded child failures expose only an allowlisted kind and safe close facts", async () => {
  const secret = "bounded-secret-token-value";
  const capture = async (args, options = {}) => {
    let failure;
    await assert.rejects(runBoundedChildTree(process.execPath, args, {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp", LANG: "C" },
      maximumOutputBytes: 128,
      timeoutMs: 2_000,
      terminationGraceMs: 100,
      killGraceMs: 1_000,
      cleanupAcknowledgementMs: 500,
      ...options,
    }), (error) => {
      failure = error;
      return true;
    });
    assert.ok(BOUNDED_CHILD_FAILURE_KINDS.includes(failure.boundedFailureKind));
    assert.doesNotMatch(JSON.stringify({ message: failure.message, stack: failure.stack }), new RegExp(secret));
    return failure;
  };

  const exited = await capture(["-e", `process.stderr.write(${JSON.stringify(secret)});process.exit(7)`]);
  assert.equal(exited.boundedFailureKind, "child_exit");
  assert.equal(exited.boundedExitCode, 7);
  assert.equal(exited.boundedSignal, null);

  const signalled = await capture(["-e", "process.kill(process.pid, 'SIGTERM')"]);
  assert.equal(signalled.boundedFailureKind, "child_signal");
  assert.equal(signalled.boundedExitCode, null);
  assert.equal(signalled.boundedSignal, "SIGTERM");

  const timedOut = await capture(["-e", "setInterval(() => {}, 1000)"], {
    timeoutMs: 100,
    confirmCleanup: () => true,
  });
  assert.equal(timedOut.boundedFailureKind, "timeout");

  const overflow = await capture(["-e", `process.stdout.write(${JSON.stringify(secret.repeat(32))});setInterval(() => {}, 1000)`], {
    confirmCleanup: () => true,
  });
  assert.equal(overflow.boundedFailureKind, "output_limit");

  const cleanup = await capture(["-e", "process.exit(0)"], { confirmCleanup: () => false });
  assert.equal(cleanup.boundedFailureKind, "cleanup_unconfirmed");
  assert.equal(cleanup.boundedExitCode, 0);
  assert.equal(cleanup.boundedSignal, null);
});

test("bounded child termination maps kill EPERM to a stable secret-free class", { skip: process.platform === "win32" }, async () => {
  const nativeKill = process.kill;
  const rawDetail = "kill EPERM /private/runtime secret-token-value";
  let childGroupPid;
  let failure;
  try {
    process.kill = (pid, signal) => {
      if (typeof pid === "number" && pid < 0 && signal === "SIGTERM") {
        childGroupPid = pid;
        const error = new Error(rawDetail);
        error.code = "EPERM";
        throw error;
      }
      return nativeKill(pid, signal);
    };
    await assert.rejects(runBoundedChildTree(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      cwd: process.cwd(), env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp", LANG: "C" },
      maximumOutputBytes: 128, timeoutMs: 50, terminationGraceMs: 100, killGraceMs: 1_000,
    }), (error) => {
      failure = error;
      return true;
    });
  } finally {
    process.kill = nativeKill;
    if (childGroupPid) {
      try { nativeKill(childGroupPid, "SIGKILL"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
    }
  }
  assert.equal(failure?.boundedFailureKind, "termination_unconfirmed");
  assert.equal(failure?.boundedExitCode, null);
  assert.equal(failure?.boundedSignal, null);
  assert.doesNotMatch(JSON.stringify({ message: failure?.message, stack: failure?.stack }), /EPERM|private\/runtime|secret-token-value/i);
});

test("bounded child close maps liveness probe errors to a stable secret-free class", { skip: process.platform === "win32" }, async () => {
  const nativeKill = process.kill;
  const rawDetail = "liveness EPERM /private/runtime secret-token-value";
  let failure;
  try {
    process.kill = (pid, signal) => {
      if (typeof pid === "number" && pid < 0 && signal === 0) {
        const error = new Error(rawDetail);
        error.code = "EPERM";
        throw error;
      }
      return nativeKill(pid, signal);
    };
    await assert.rejects(runBoundedChildTree(process.execPath, ["-e", "process.exit(0)"], {
      cwd: process.cwd(), env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp", LANG: "C" },
      maximumOutputBytes: 128, timeoutMs: 2_000, terminationGraceMs: 100, killGraceMs: 1_000,
    }), (error) => {
      failure = error;
      return true;
    });
  } finally {
    process.kill = nativeKill;
  }
  assert.equal(failure?.boundedFailureKind, "termination_unconfirmed");
  assert.equal(failure?.boundedExitCode, 0);
  assert.equal(failure?.boundedSignal, null);
  assert.doesNotMatch(JSON.stringify({ message: failure?.message, stack: failure?.stack }), /EPERM|private\/runtime|secret-token-value/i);
});

test("acceptance wraps generated and Phase 7 bounded failures into distinct secret-free classes", async () => {
  const ambient = {
    PATH: "/usr/bin:/bin",
    HOME: "/Users/acceptance",
    TMPDIR: "/private/tmp/acceptance",
    LANG: "C",
    LC_ALL: "C",
    BLOG_X_SECRET_TOKEN: "must-not-cross",
  };
  assert.deepEqual(buildLocalDeliveryAcceptanceEnvironment(ambient), {
    PATH: ambient.PATH,
    HOME: ambient.HOME,
    TMPDIR: ambient.TMPDIR,
    LANG: ambient.LANG,
    LC_ALL: ambient.LC_ALL,
  });

  const cases = [
    { stage: "generated", result: { exitCode: 9, signal: null, combined: "generated raw secret-token" }, expected: "generated_child_exit" },
    { stage: "generated", result: { exitCode: null, signal: null, combined: "raw timeout", timedOut: true }, expected: "generated_timeout" },
    { stage: "phase7", result: { exitCode: null, signal: null, combined: "raw overflow", overflow: true }, expected: "phase7_output_limit" },
    { stage: "phase7", result: { exitCode: 0, signal: null, combined: "raw cleanup", cleanupConfirmed: false }, expected: "phase7_cleanup_unconfirmed" },
  ];
  for (const scenario of cases) {
    const calls = [];
    const runtime = createLocalDeliveryAcceptanceTestRuntime({
      ambient,
      async processBoundary(command, args, options) {
        calls.push({ command, args, options });
        const generated = args[0]?.endsWith("local-verify.mjs");
        if (scenario.stage === "generated" && generated || scenario.stage === "phase7" && !generated) return scenario.result;
        return { exitCode: 0, signal: null, combined: generated ? generatedOutput : phase7Output, cleanupConfirmed: true };
      },
    });
    let failure;
    await assert.rejects(runtime.run(), (error) => {
      failure = error;
      return true;
    });
    assert.equal(failure.acceptanceFailureClass, scenario.expected);
    assert.ok(ACCEPTANCE_FAILURE_CLASSES.includes(failure.acceptanceFailureClass));
    assert.doesNotMatch(JSON.stringify({ message: failure.message, stack: failure.stack }), /raw |secret-token|must-not-cross|\/private\/tmp\/acceptance/i);
    assert.deepEqual(calls[0].options.env, buildLocalDeliveryAcceptanceEnvironment(ambient));

    const line = formatLocalDeliveryAcceptanceFailure(failure);
    assert.doesNotMatch(line, /raw |secret-token|must-not-cross|\/private\/tmp\/acceptance/i);
    assert.deepEqual(parseLocalDeliveryAcceptanceFailure(line), {
      format: "blog-x-v1.1-local-delivery-acceptance-failure",
      version: 1,
      acceptanceFailureClass: scenario.expected,
      exitCode: Number.isSafeInteger(failure.boundedExitCode) ? failure.boundedExitCode : null,
      signal: failure.boundedSignal ?? null,
    });
  }
});

test("production coordinator is sealed, zero-argument, and has no test-core, canonical-data, or remote authority", async () => {
  const source = await readFile(join(process.cwd(), "scripts/local-delivery-acceptance.mjs"), "utf8");
  const generatedSource = await readFile(join(process.cwd(), "scripts/local-verify.mjs"), "utf8");
  const phase7Source = await readFile(join(process.cwd(), "scripts/phase7-browser-verify.mjs"), "utf8");
  assert.match(source, /export async function runLocalDeliveryAcceptance\(\.\.\.args\)/);
  assert.match(source, /args\.length/);
  assert.doesNotMatch(source, /local-delivery-acceptance-test-core|createLocalDeliveryAcceptanceTestRuntime|blogxlocal|docker-compose|migration|cutover|\b(?:ssh|scp|rsync|fetch\()/i);
  assert.match(source, /scripts\/local-verify\.mjs[\s\S]*--canonical-integration[\s\S]*--interruption-check[\s\S]*--parallel-check/);
  assert.match(source, /scripts\/phase7-browser-verify\.mjs/);
  assert.doesNotMatch(source, /grep/);
  assert.match(source, /maximumOutputBytes/);
  assert.match(source, /childTimeoutMs/);
  assert.match(source, /childTimeoutMs = 20 \* 60_000/);
  assert.match(source, /runBoundedChildTree/);
  assert.match(generatedSource, /installCooperativeShutdown[\s\S]*allowDuringShutdown[\s\S]*confirmGeneratedProjectAbsent/);
  assert.match(generatedSource, /BLOG X GENERATED INTEGRATION CLEANUP ACK/);
  assert.match(phase7Source, /installCooperativeShutdown[\s\S]*signalCleanupPromise[\s\S]*stopExactChildren/);
  assert.match(phase7Source, /BLOG X PHASE7 CLEANUP ACK/);
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

test("forced process-group termination does not claim generated-authority cleanup without acknowledgement", { skip: process.platform === "win32" }, async () => {
  const port = await freePort(); const output = []; const started = Date.now();
  await assert.rejects(runBoundedChildTree(process.execPath, ["scripts/fixtures/local-delivery-child-tree-helper.mjs", String(port)], {
    cwd: process.cwd(), env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp", LANG: "C" },
    maximumOutputBytes: 64 * 1024, timeoutMs: 750, terminationGraceMs: 150, killGraceMs: 2_000,
    onOutput(value) { output.push(value); },
  }), /bounded time.*terminated without generated-authority acknowledgement/i);
  assert.ok(Date.now() - started < 4_000, "controller must settle inside its advertised timeout and kill grace");
  const combined = output.join("");
  assert.match(combined, /PARENT_READY \d+/);
  const descendantPid = Number(/DESCENDANT_READY (\d+)/.exec(combined)?.[1]);
  assert.ok(Number.isSafeInteger(descendantPid));
  assert.equal(await portIsClosed(port), true, "generated listener remained reachable");
  assert.throws(() => process.kill(descendantPid, 0), (error) => error?.code === "ESRCH");
});

test("Phase 7 signal during generated-root setup acknowledges exact root cleanup", { skip: process.platform === "win32" }, async () => {
  const output = [];
  await assert.rejects(runBoundedChildTree(process.execPath, ["scripts/phase7-browser-verify.mjs", "--force-setup-wait"], {
    cwd: process.cwd(), env: { ...process.env, LANG: "C" }, maximumOutputBytes: 1024 * 1024,
    timeoutMs: 1_000, terminationGraceMs: 4_000, killGraceMs: 2_000,
    confirmCleanup(value) { return Boolean(assertPhase7CleanupAcknowledgement(value)); },
    onOutput(value) { output.push(value); },
  }), /bounded time.*generated authority cleanup confirmed/i);
  const combined = output.join("");
  const acknowledgement = assertPhase7CleanupAcknowledgement(combined);
  assert.equal(acknowledgement.origins.length, 0);
  await assert.rejects(readFile(acknowledgement.webRoot), /ENOENT/);
});
