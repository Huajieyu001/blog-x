import assert from "node:assert/strict";
import test from "node:test";
import { escapeXml, publicOrigin, publicUrl, renderRss } from "./site-metadata";

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
