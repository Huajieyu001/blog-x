import assert from "node:assert/strict";
import test from "node:test";
import { operationalRetentionSuite, phase17Commands, phase17Suites, runAcceptance, secondaryTimerSuite } from "./phase17-acceptance.mjs";

const tlsEvidenceSuite = "scripts/ops/tls-evidence.test.mjs";
const requiredStaticSuites = [
  "scripts/ops/job-results.test.mjs",
  "scripts/ops-status.test.mjs",
  "scripts/ops/notify.test.mjs",
  "scripts/ops-monitor.test.mjs",
  "ops/systemd/monitoring-systemd.test.mjs",
  tlsEvidenceSuite,
  secondaryTimerSuite,
];

test("phase 17 acceptance runs only explicit local focused suites", async () => {
  assert.equal(new Set(phase17Suites).size, phase17Suites.length);
  assert.ok(phase17Suites.every((suite) => suite.endsWith(".test.mjs")));
  for (const suite of requiredStaticSuites) assert.equal(phase17Suites.filter((item) => item === suite).length, 1);
  assert.equal(operationalRetentionSuite, "test/operational-retention.test.ts");
  assert.deepEqual(phase17Commands, [
    { command: "node", args: ["--test", ...phase17Suites] },
    { command: "corepack", args: ["pnpm", "--filter", "@blog-x/api", "exec", "node", "--import", "tsx", "--test", operationalRetentionSuite] },
  ]);

  const calls = [];
  assert.equal(await runAcceptance(async (command, args) => {
    calls.push({ command, args });
    return 0;
  }), 0);
  assert.deepEqual(calls, phase17Commands);
});

test("phase 17 acceptance stops on a fixed child failure without executing later commands", async () => {
  const calls = [];
  assert.equal(await runAcceptance(async (command, args) => {
    calls.push({ command, args });
    return command === "node" ? 0 : 17;
  }), 17);
  assert.deepEqual(calls, phase17Commands);
});
