import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("remaining administrator and authentication requests use the shared deadline helper", () => {
  const paths = [
    "../login/page.tsx",
    "../TracerAdmin.tsx",
    "../admin/LogoutButton.tsx",
    "../admin/security/page.tsx",
    "../admin/_components/TaxonomyManager.tsx",
    "../admin/_components/DeletedPostList.tsx",
    "../admin/_components/MediaPanel.tsx",
    "../admin/_components/MediaLibrary.tsx",
    "../admin/_components/ArticleRevisionHistory.tsx",
  ];

  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /\bfetchWithDeadline\(/, `${path} should call fetchWithDeadline`);
    assert.doesNotMatch(source, /\bfetch\(/, `${path} should not bypass fetchWithDeadline`);
  }
});

test("public view beacon uses the shared default deadline without changing anonymous delivery semantics", () => {
  const source = readFileSync(
    new URL("../posts/[slug]/ViewBeacon.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /import \{ fetchWithDeadline \} from "\.\.\/\.\.\/lib\/client-fetch";/,
  );
  assert.match(source, /\bfetchWithDeadline\(/);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.ok(
    source.indexOf("sentSlugs.current.add(slug);") < source.indexOf("fetchWithDeadline("),
    "the slug must be recorded before dispatch",
  );
  assert.match(source, /method: "POST"/);
  assert.match(source, /headers: \{ "content-type": "application\/json" \}/);
  assert.match(source, /body: "\{\}"/);
  assert.match(source, /credentials: "omit"/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /keepalive: true/);
  assert.match(source, /\}\)\.catch\(\(\) => undefined\);/);
  assert.match(source, /\}, \[slug\]\);/);
  assert.match(source, /return null;/);
});
