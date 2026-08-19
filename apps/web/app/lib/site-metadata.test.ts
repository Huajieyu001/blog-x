import assert from "node:assert/strict";
import test from "node:test";
import { escapeXml, pageMetadata, publicOrigin, publicUrl, renderRss, resolveCanonicalPage } from "./site-metadata";

test("public origin accepts only an absolute HTTP(S) origin and fails closed in production", () => {
  assert.equal(publicOrigin("https://blog.example").toString(), "https://blog.example/");
  assert.equal(publicUrl("/posts/one", publicOrigin("https://blog.example")), "https://blog.example/posts/one");
  for (const candidate of ["/relative", "ftp://blog.example", "https://user:pass@blog.example", "https://blog.example/blog", "https://blog.example/?x=1", "https://blog.example/#fragment"]) {
    assert.throws(() => publicOrigin(candidate), /PUBLIC_ORIGIN/i);
  }
  assert.throws(() => publicOrigin(undefined, true), /required/i);
});

test("RSS escapes hostile summary text, removes invalid controls, and preserves permanent same-origin links", () => {
  const origin = publicOrigin("https://blog.example");
  const rss = renderRss({
    articles: Array.from({ length: 21 }, (_, index) => ({
      title: `Article ${index} <&`,
      summary: `Summary ${index}\u0001 <tag> & \"quote\" 'apostrophe'`,
      slug: `article-${index}`,
      publishedAt: "2026-08-09T09:00:00.000Z",
      updatedAt: "2026-08-09T09:00:00.000Z",
      category: null,
      tags: [],
    })),
    categories: [],
    tags: [],
    about: null,
  }, origin);
  assert.equal((rss.match(/<item>/g) ?? []).length, 20);
  assert.match(rss, /<title>Article 0 &lt;&amp;<\/title>/);
  assert.match(rss, /Summary 0 &lt;tag&gt; &amp; &quot;quote&quot; &apos;apostrophe&apos;/);
  assert.doesNotMatch(rss, /\u0001/);
  assert.match(rss, /<link>https:\/\/blog\.example\/posts\/article-0<\/link><guid isPermaLink="true">https:\/\/blog\.example\/posts\/article-0<\/guid>/);
  assert.match(rss, /<pubDate>Sun, 09 Aug 2026 09:00:00 GMT<\/pubDate>/);
  assert.doesNotMatch(rss, /markdown|renderedHtml|INTERNAL_API_ORIGIN/i);
  assert.equal(escapeXml("<&>\"'\u0000"), "&lt;&amp;&gt;&quot;&apos;");
});

test("canonical pagination accepts only the exact indexable shapes", () => {
  const origin = publicOrigin("https://blog.example");
  const indexable = resolveCanonicalPage("/categories", {}, 3, origin);
  assert.deepEqual(indexable, { canonical: "https://blog.example/categories", index: true });
  assert.deepEqual(resolveCanonicalPage("/categories", { page: "1" }, 3, origin), indexable);
  assert.deepEqual(resolveCanonicalPage("/categories", { page: "2" }, 3, origin), {
    canonical: "https://blog.example/categories?page=2", index: true,
  });
  for (const searchParams of [
    { page: ["1", "2"] }, { page: "01" }, { page: "0" }, { page: "4" },
    { page: "" }, { page: "2.0" }, { page: "two" }, { page: "1", extra: "x" },
  ]) {
    assert.deepEqual(resolveCanonicalPage("/categories", searchParams, 3, origin), { index: false });
  }
});

test("page metadata emits complete canonical Open Graph and noindex metadata", () => {
  const origin = publicOrigin("https://blog.example");
  const metadata = pageMetadata({
    title: "文章标题",
    description: "文章描述",
    path: "/posts/example",
    type: "article",
    origin,
  });
  assert.equal(metadata.alternates?.canonical, "https://blog.example/posts/example");
  assert.deepEqual(metadata.openGraph, {
    title: "文章标题",
    description: "文章描述",
    type: "article",
    url: "https://blog.example/posts/example",
    siteName: "Blog X",
  });
  assert.deepEqual(pageMetadata({ title: "无效", description: "无效", path: "/", origin, index: false }).robots, { index: false, follow: true });
});

test("page metadata keeps canonical, robots and Open Graph decisions independent", () => {
  const origin = publicOrigin("https://blog.example");
  const canonicalNoIndex = pageMetadata({
    title: "搜索文章",
    description: "搜索已发布文章。",
    path: "/search",
    canonicalPath: "/search?q=%E4%B8%AD%E6%96%87",
    origin,
    index: false,
  });
  assert.deepEqual(canonicalNoIndex.robots, { index: false, follow: true });
  assert.equal(canonicalNoIndex.alternates?.canonical, "https://blog.example/search?q=%E4%B8%AD%E6%96%87");
  assert.equal(canonicalNoIndex.openGraph?.url, "https://blog.example/search");

  const noCanonical = pageMetadata({ title: "搜索文章", description: "搜索已发布文章。", path: "/search", canonicalPath: null, origin, index: false });
  assert.deepEqual(noCanonical.robots, { index: false, follow: true });
  assert.equal(noCanonical.alternates, undefined);
  assert.equal(noCanonical.openGraph?.url, "https://blog.example/search");
});
