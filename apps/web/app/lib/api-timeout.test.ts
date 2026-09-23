import assert from "node:assert/strict";
import test from "node:test";
import { getAdminPostsResult, getPublicPosts, getSessionStatus, internalApiFetch } from "./api.js";

function installFetch(fetcher: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  return () => { globalThis.fetch = original; };
}

function waitForAbort(signal: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

test("internal reads receive a fresh deadline signal and preserve caller cancellation", async (context) => {
  const signals: AbortSignal[] = [];
  context.after(installFetch(async (_input, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    signals.push(init.signal);
    return waitForAbort(init.signal);
  }));

  const caller = new AbortController();
  const timedOut = internalApiFetch("/deadline", {}, 5);
  const cancelled = internalApiFetch("/cancelled", { signal: caller.signal }, 100);
  const timedOutAssertion = assert.rejects(timedOut);
  const cancelledAssertion = assert.rejects(cancelled, /caller cancelled/);
  caller.abort(new Error("caller cancelled"));

  await Promise.all([timedOutAssertion, cancelledAssertion]);
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, true);
});

test("hung public, administrator, and session reads keep their opaque failure results", async (context) => {
  context.after(installFetch(async (_input, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    throw new DOMException("request deadline exceeded", "TimeoutError");
  }));

  assert.deepEqual(await getPublicPosts(1), { kind: "upstream_error" });
  assert.deepEqual(await getAdminPostsResult("cookie"), { kind: "upstream_error" });
  assert.equal(await getSessionStatus("cookie"), null);
});
