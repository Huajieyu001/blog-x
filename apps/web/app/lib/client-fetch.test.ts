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

test("media catalogue cancels stale loads without changing timeout recovery or image semantics", () => {
  const library = readFileSync(new URL("../admin/_components/MediaLibrary.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../admin/_components/MediaPanel.tsx", import.meta.url), "utf8");

  assert.match(library, /const catalogAbort = useRef<AbortController \| null>\(null\);/);
  assert.match(library, /catalogAbort\.current\?\.abort\(\);\s*const controller = new AbortController\(\);\s*catalogAbort\.current = controller;/);
  assert.match(library, /fetchWithDeadline\([\s\S]*?credentials: "same-origin",\s*signal: controller\.signal,/);
  assert.match(library, /if \(controller\.signal\.aborted \|\| request !== catalogRequest\.current\) return;/);
  assert.match(library, /return \(\) => \{ catalogRequest\.current \+= 1; catalogAbort\.current\?\.abort\(\); \};/);
  assert.match(library, /isFetchDeadlineExceeded\(error\)[\s\S]*?媒体目录加载超时/);
  assert.match(library, /<img src=\{item\.url\} width=\{item\.width\} height=\{item\.height\} alt="" loading="lazy" decoding="async" \/>/);
  assert.match(panel, /<img src=\{media\.url\} width=\{media\.width\} height=\{media\.height\} alt=\{media\.decorative \? "" : media\.alt\} loading="lazy" decoding="async" \/>/);
});

test("media upload recognizes sanitized retryable service failures", () => {
  const panel = readFileSync(new URL("../admin/_components/MediaPanel.tsx", import.meta.url), "utf8");

  assert.match(panel, /mediaUnavailableResponseSchema/);
  assert.match(panel, /response\.status === 503 && mediaUnavailableResponseSchema\.safeParse\(body\)\.success/);
  assert.match(panel, /媒体服务暂时不可用，所选文件仍然保留，可直接重试。/);
  assert.match(panel, /图片未上传：文件格式或大小不符合要求，请重新选择。/);
  assert.match(panel, /上传请求超时，服务器可能已保存图片；请先刷新媒体库确认，所选文件仍然保留。/);
  assert.match(panel, /setUploadFailed\(response\.status !== 400 && response\.status !== 413\)/);
});

test("administrator mutation transport failures remain localized and outcome-honest", () => {
  const taxonomy = readFileSync(new URL("../admin/_components/TaxonomyManager.tsx", import.meta.url), "utf8");
  const media = readFileSync(new URL("../admin/_components/MediaLibrary.tsx", import.meta.url), "utf8");
  const articleActions = readFileSync(new URL("../admin/_components/ArticleActions.tsx", import.meta.url), "utf8");
  const revisions = readFileSync(new URL("../admin/_components/ArticleRevisionHistory.tsx", import.meta.url), "utf8");
  const trash = readFileSync(new URL("../admin/_components/DeletedPostList.tsx", import.meta.url), "utf8");

  assert.match(taxonomy, /网络中断，保存结果未知；请刷新确认后再重试。/);
  assert.match(taxonomy, /网络中断，删除结果未知；请刷新确认后再重试。/);
  assert.doesNotMatch(taxonomy, /未保存任何更改|内容没有删除/);
  assert.match(media, /class MediaCatalogResponseError extends Error/);
  assert.match(media, /error instanceof MediaCatalogResponseError \? error\.message : catalogError\(\)/);
  assert.match(media, /class MediaDeleteResponseError extends Error/);
  assert.match(media, /error instanceof MediaDeleteResponseError[\s\S]*?error\.message/);
  assert.match(media, /网络中断，删除结果未知；请刷新媒体库确认后再重试。/);
  assert.doesNotMatch(media, /error instanceof Error \? error\.message/);
  assert.match(articleActions, /const ambiguousMutationResultMessage = "网络中断或响应异常，操作结果未知；请先刷新确认后再重试";/);
  assert.equal((articleActions.match(/: ambiguousMutationResultMessage\);/g) ?? []).length, 3);
  assert.doesNotMatch(articleActions, /网络异常，请重试/);
  for (const source of [revisions, trash]) {
    assert.match(source, /网络中断或响应异常，恢复结果未知；请刷新确认后再重试。/);
  }
  assert.doesNotMatch(revisions, /当前内容未被更改/);
  assert.match(revisions, /文章已被其他保存更新，请刷新后重新选择历史版本。/);
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
