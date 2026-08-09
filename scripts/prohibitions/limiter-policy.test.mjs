import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cleanPolicy = { scope: "single-process", forwardedHeadersTrusted: false, crossProcessSharing: false };

async function subject() {
  if (!process.env.GSD_PROHIB_SUBJECT) return cleanPolicy;
  return JSON.parse(await readFile(process.env.GSD_PROHIB_SUBJECT, "utf8"));
}

test("limiter policy never trusts forwarded headers or claims distributed protection", async () => {
  const value = await subject();
  assert.deepEqual(Object.keys(value).sort(), ["crossProcessSharing", "forwardedHeadersTrusted", "scope"]);
  assert.equal(value.scope, "single-process");
  assert.equal(value.forwardedHeadersTrusted, false);
  assert.equal(value.crossProcessSharing, false);
});
