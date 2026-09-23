import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildBlogPosting, escapeXml, pageMetadata, publicOrigin, publicUrl, renderRss, resolveCanonicalPage, serializeJsonLd } from "./site-metadata";

test("public origin accepts only an absolute HTTP(S) origin and fails closed in production", () => {
  const origin = publicOrigin("https://blog.example");
  assert.equal(origin.toString(), "https://blog.example/");
  assert.equal(publicUrl("/posts/one", origin), "https://blog.example/posts/one");
  for (const path of ["posts/one", "//evil.example/x", "/\\evil.example/x"]) {
    assert.throws(() => publicUrl(path, origin), /same-origin|PUBLIC_ORIGIN/i);
  }
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
  }, undefined, origin);
  assert.equal((rss.match(/<item>/g) ?? []).length, 20);
  assert.match(rss, /<title>Article 0 &lt;&amp;<\/title>/);
  assert.match(rss, /Summary 0 &lt;tag&gt; &amp; &quot;quote&quot; &apos;apostrophe&apos;/);
  assert.doesNotMatch(rss, /\u0001/);
  assert.match(rss, /<link>https:\/\/blog\.example\/posts\/article-0<\/link><guid isPermaLink="true">https:\/\/blog\.example\/posts\/article-0<\/guid>/);
  assert.match(rss, /<pubDate>Sun, 09 Aug 2026 09:00:00 GMT<\/pubDate>/);
  assert.doesNotMatch(rss, /markdown|renderedHtml|INTERNAL_API_ORIGIN/i);
  assert.equal(escapeXml("<&>\"'\u0000"), "&lt;&amp;&gt;&quot;&apos;");
});

test("settings-aware distribution builders preserve Unicode identity, escaping, and same-origin URLs", () => {
  const origin = publicOrigin("https://blog.example");
  const site = { name: '猫 & <码> "站点"', description: '长期 & <实践> "安全"' };
  const article = {
    title: "公开文章",
    summary: "公开摘要",
    slug: "unicode article",
    publishedAt: "2026-09-04T08:00:00.000Z",
  };

  const metadata = pageMetadata({
    title: article.title,
    description: article.summary,
    path: "/posts/unicode%20article",
    type: "article",
    origin,
    site,
  });
  assert.equal(metadata.openGraph?.siteName, site.name);
  assert.equal(metadata.openGraph?.url, "https://blog.example/posts/unicode%20article");

  const posting = buildBlogPosting(article, origin, site);
  assert.deepEqual(posting.publisher, {
    "@type": "Organization",
    name: site.name,
    description: site.description,
  });
  const jsonLd = serializeJsonLd(buildBlogPosting({ ...article, title: `${article.title}</script>` }, origin, site));
  assert.doesNotMatch(jsonLd, /</);
  assert.match(jsonLd, /猫 & \\u003c码>/);

  const rss = renderRss({ articles: [{ ...article, updatedAt: article.publishedAt, category: null, tags: [] }], categories: [], tags: [], about: null }, site, origin);
  assert.match(rss, /<channel><title>猫 &amp; &lt;码&gt; &quot;站点&quot;<\/title>/);
  assert.match(rss, /<description>长期 &amp; &lt;实践&gt; &quot;安全&quot;<\/description>/);
  assert.match(rss, /<link>https:\/\/blog\.example\/<\/link>/);
  assert.match(rss, /https:\/\/blog\.example\/posts\/unicode%20article/);
  assert.doesNotMatch(rss, /evil\.example/);
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

test("BlogPosting uses only four public facts and the exact canonical seven-key shape", () => {
  const origin = publicOrigin("https://blog.example");
  const posting = buildBlogPosting({
    title: "A public title",
    summary: "A public summary",
    slug: "中文 / trusted result",
    publishedAt: "2026-09-04T08:00:00.000Z",
  }, origin);

  assert.deepEqual(Object.keys(posting), ["@context", "@type", "headline", "description", "datePublished", "publisher", "mainEntityOfPage", "url"]);
  assert.deepEqual(posting, {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: "A public title",
    description: "A public summary",
    datePublished: "2026-09-04T08:00:00.000Z",
    publisher: {
      "@type": "Organization",
      name: "Blog X",
      description: "记录代码、系统与长期实践。",
    },
    mainEntityOfPage: "https://blog.example/posts/%E4%B8%AD%E6%96%87%20%2F%20trusted%20result",
    url: "https://blog.example/posts/%E4%B8%AD%E6%96%87%20%2F%20trusted%20result",
  });
  const raw = serializeJsonLd(posting);
  for (const excluded of ["markdown", "renderedHtml", "seoDescription", "category", "tags", "cover", "status", "INTERNAL_API_ORIGIN", "storage"]) {
    assert.doesNotMatch(raw, new RegExp(excluded, "i"));
  }
});

test("BlogPosting serialization is inert raw script text and round-trips all public values", () => {
  const input = {
    title: 'Closing </script><div id="json-ld-injected">never</div>',
    summary: "line\u2028separator\u2029paragraph < safe",
    slug: "hostile slug",
    publishedAt: "2026-09-04T08:00:00.000Z",
  };
  const posting = buildBlogPosting(input, publicOrigin("https://blog.example"));
  const raw = serializeJsonLd(posting);

  assert.doesNotMatch(raw, /</);
  assert.match(raw, /\\u003c\/script>/);
  assert.match(raw, /\\u2028/);
  assert.match(raw, /\\u2029/);
  assert.deepEqual(JSON.parse(raw), posting);
});

test("public page metadata uses validated public site identity", () => {
  for (const path of [
    "../page.tsx",
    "../categories/page.tsx",
    "../categories/[slug]/page.tsx",
    "../tags/page.tsx",
    "../tags/[slug]/page.tsx",
    "../archives/page.tsx",
    "../search/page.tsx",
    "../about/page.tsx",
    "../posts/[slug]/page.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /getPublicSiteSettings/, `${path} should load public site settings`);
    assert.match(source, /defaultSiteSettings/, `${path} should retain the contract fallback`);
    assert.match(source, /pageMetadata\(\{[\s\S]*?\bsite\s*[,}]/, `${path} should pass site identity to metadata`);
  }
});

test("public article render starts cached reads together and keeps recovery plus cover contracts", () => {
  const page = readFileSync(new URL("../posts/[slug]/page.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

  assert.match(page, /const \[result, siteResult, relatedResult\] = await Promise\.all\(\[\s*getPublicPost\(slug\),\s*getPublicSiteSettings\(\),\s*getPublicRelatedPosts\(slug\),\s*\]\)/);
  assert.match(api, /const cachedPublicRelatedPosts = cache\(\(slug: string\) => getPublic\(`\/public\/articles\/\$\{encodeURIComponent\(slug\)\}\/related`, publicRelatedPostsResponseSchema\)\)/);
  assert.match(api, /export function getPublicRelatedPosts\(slug: string\): Promise<PublicResult<PublicRelatedPostsResponse>> \{\s*return cachedPublicRelatedPosts\(slug\);\s*\}/);

  assert.match(page, /if \(result\.kind === "redirect"\) permanentRedirect\(result\.location\);/);
  assert.match(page, /if \(result\.kind === "not_found"\) notFound\(\);/);
  assert.match(page, /if \(result\.kind === "upstream_error"\) throw new Error\("public content unavailable"\);/);
  assert.match(page, /siteResult\.kind === "ok" \? siteResult\.data : defaultSiteSettings/);
  assert.match(page, /relatedResult\.kind === "ok" && relatedItems\.length > 0/);
  assert.match(page, /relatedResult\.kind !== "ok"/);

  assert.match(page, /<img[\s\S]*?src=\{article\.cover\.url\}[\s\S]*?width=\{article\.cover\.width\}[\s\S]*?height=\{article\.cover\.height\}[\s\S]*?alt=\{article\.cover\.decorative \? "" : article\.cover\.alt\}[\s\S]*?decoding="async"[\s\S]*?fetchPriority="high"/);
});
