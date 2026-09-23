import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithDeadline, isFetchDeadlineExceeded } from "./client-fetch";

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

test("deadline uses an independent platform timeout signal", async (context) => {
  const signals: AbortSignal[] = [];
  context.after(installFetch(async (_input, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    signals.push(init.signal);
    return waitForAbort(init.signal);
  }));

  await assert.rejects(fetchWithDeadline("/deadline", {}, 5), (error) => {
    assert.equal(isFetchDeadlineExceeded(error), true);
    return true;
  });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, true);
});

test("caller cancellation is composed without becoming a deadline", async (context) => {
  context.after(installFetch(async (_input, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    return waitForAbort(init.signal);
  }));

  const caller = new AbortController();
  const request = fetchWithDeadline("/cancelled", { signal: caller.signal }, 100);
  const reason = new Error("caller cancelled");
  caller.abort(reason);
  await assert.rejects(request, /caller cancelled/);
  assert.equal(isFetchDeadlineExceeded(reason), false);
});

test("a timed-out request cannot abort a concurrent sibling", async (context) => {
  const signals: AbortSignal[] = [];
  context.after(installFetch(async (input, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    signals.push(init.signal);
    return String(input).endsWith("/slow")
      ? waitForAbort(init.signal)
      : new Response(null, { status: 204 });
  }));

  const slow = fetchWithDeadline("/slow", {}, 5);
  const fast = fetchWithDeadline("/fast", {}, 100);
  await assert.rejects(slow, (error) => isFetchDeadlineExceeded(error));
  assert.equal((await fast).status, 204);
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
});
