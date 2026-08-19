import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { canonicalPhase5ResultBytes, hashPhase5ResultRecord, phase5ExecutionResultSchema } from "./phase5-receipt.mjs";
import { createPhase5ResultRecorder, parseSemanticTapResult } from "./local-verify.mjs";

const fixture = async (name) => JSON.parse(await readFile(join(process.cwd(), "scripts/fixtures/prohibitions", name), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("historical suite/revision formula and fixed 1/1 result are authentic and rejected", async () => {
  const value = await fixture("phase5-receipt-synthetic-results.json");
  const derived = `${value.derivationPrefix}:${value.suiteId}:${value.implementationRevision}`;
  assert.equal(derived, value.derivedBytes);
  assert.equal(sha256(derived), value.resultSha256);
  assert.deepEqual(value.legacyResult, { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.throws(() => phase5ExecutionResultSchema.parse(value.legacyResult), /execution result|invalid/i);
  assert.throws(() => phase5ExecutionResultSchema.parse({
    ...value.legacyResult,
    suiteId: value.suiteId,
    implementationRevision: value.implementationRevision,
    resultSha256: value.resultSha256,
  }), /execution result|invalid/i);
});

test("captured TAP bytes rebuild one accepted non-fixed canonical result", async () => {
  const value = await fixture("phase5-receipt-actual-results.json");
  const counts = parseSemanticTapResult(value.capturedOutput);
  assert.deepEqual(counts, value.expected.counts);
  assert.notEqual(counts.tests, 1);
  assert.equal(Buffer.byteLength(value.capturedOutput), value.expected.normalizedOutputBytes);
  assert.equal(sha256(value.capturedOutput), value.expected.normalizedOutputSha256);

  const manifest = { format: "blog-x-phase5-suite-manifest", version: 2, suites: [value.suite] };
  const recorder = createPhase5ResultRecorder(manifest);
  recorder.recordCommand(value.suite.id, "node-tap-v13", {
    startedAt: value.timing.startedAt,
    completedAt: value.timing.completedAt,
    exitCode: 0,
    signal: null,
    combined: value.capturedOutput,
  }, parseSemanticTapResult);
  const [{ resultRecord, resultSha256 }] = recorder.finalize();
  assert.equal(resultRecord.invocations[0].redactedOutputBytes, value.expected.normalizedOutputBytes);
  assert.equal(resultRecord.invocations[0].redactedOutputSha256, value.expected.normalizedOutputSha256);
  assert.deepEqual(resultRecord.counts, value.expected.counts);
  assert.equal(resultSha256, value.expected.resultSha256);
  assert.equal(hashPhase5ResultRecord(resultRecord), value.expected.resultSha256);
  assert.equal(phase5ExecutionResultSchema.parse(resultRecord), resultRecord);

  for (const mutate of [
    (record) => { record.invocations[0].redactedOutputBytes += 1; },
    (record) => { record.invocations[0].counts.tests = 1; },
    (record) => { record.counts.passed = 1; },
  ]) {
    const changed = structuredClone(resultRecord);
    mutate(changed);
    assert.notEqual(hashPhase5ResultRecord(changed), value.expected.resultSha256);
  }
  for (const mutate of [
    (record) => { record.invocations[0].counts.tests = 1; },
    (record) => { record.counts.passed = 1; },
    (record) => { record.sourceSha256 = "0".repeat(63); },
  ]) {
    const changed = structuredClone(resultRecord);
    mutate(changed);
    assert.throws(() => phase5ExecutionResultSchema.parse(changed), /execution result|counts|aggregate|invalid/i);
  }
  assert.notEqual(sha256(Buffer.concat([canonicalPhase5ResultBytes(resultRecord), Buffer.from("mutation")])), value.expected.resultSha256);
});
