import assert from "node:assert/strict";
import test from "node:test";
import { phase17Suites, runAcceptance } from "./phase17-acceptance.mjs";

const tlsEvidenceSuite = "scripts/ops/tls-evidence.test.mjs";

test("phase 17 acceptance runs only explicit local focused suites", async () => {
  assert.equal(new Set(phase17Suites).size, phase17Suites.length);
  assert.ok(phase17Suites.every((suite) => suite.endsWith(".test.mjs")));
  assert.equal(phase17Suites.filter((suite) => suite === tlsEvidenceSuite).length, 1);

  let args;
  assert.equal(await runAcceptance(async (value) => {
    args = value;
    return 0;
  }), 0);
  assert.deepEqual(args, ["--test", ...phase17Suites]);
  assert.equal(args.filter((suite) => suite === tlsEvidenceSuite).length, 1);
});
