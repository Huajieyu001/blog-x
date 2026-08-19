import assert from "node:assert/strict";
import test from "node:test";
import { classifyArticleMedia, isMediaPath } from "../src/content/media-reference-policy.js";
import { renderMarkdown } from "../src/content/markdown.js";

test("renders the supported technical Markdown surface and safely falls back for unknown fences", async () => {
  const markdown = [
    "# Technical note",
    "",
    "> A quoted constraint.",
    "",
    "| Runtime | Result |",
    "| --- | --- |",
    "| Node | Pass |",
    "",
    "[Documentation](https://example.com/docs)",
    "[Local page](/about)",
    "",
    "![Architecture](/media/123e4567-e89b-42d3-a456-426614174000)",
    "",
    "```ts",
    "const answer: number = 42;",
    "```",
    "",
    "```not-a-real-language",
    "<button onclick=\"steal()\">escaped</button>",
    "```",
  ].join("\n");

  const { html, toc } = await renderMarkdown(markdown);

  assert.match(html, /<h1>Technical note<\/h1>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<table>/);
  assert.match(html, /href="https:\/\/example\.com\/docs"/);
  assert.match(html, /href="\/about"/);
  assert.match(html, /src="\/media\/123e4567-e89b-42d3-a456-426614174000"/);
  assert.match(html, /class="shiki github-light"/);
  assert.match(html, /language-not-a-real-language/);
  assert.match(html, /&#x3C;button onclick="steal\(\)"/);
  assert.doesNotMatch(html, /<button/i);
  assert.deepEqual(toc, []);
});

test("allows only exact root-relative UUID media images while retaining ordinary external anchors", async () => {
  const allowed = "/media/123e4567-e89b-42d3-a456-426614174000";
  const rejected = [
    "https://images.example.test/remote.png",
    "http://images.example.test/mixed.png",
    "//images.example.test/protocol-relative.png",
    "data:image/png;base64,AA==",
    "blob:https://images.example.test/id",
    "file:///tmp/image.png",
    "javascript:alert(1)",
    "images/relative.png",
    "/media/not-a-uuid",
    `${allowed}?cache=1`,
    `${allowed}#fragment`,
    "/media/%31%32%33e4567-e89b-42d3-a456-426614174000",
    "/media/../images/relative.png",
    "https://blog.example.test/media/123e4567-e89b-42d3-a456-426614174000",
  ];

  assert.equal(isMediaPath(allowed), true);
  for (const source of rejected) {
    assert.equal(isMediaPath(source), false, source);
    const { html } = await renderMarkdown(`![Unsafe](${source})`);
    assert.doesNotMatch(html, /<img[^>]+src=/, source);
  }

  const classification = classifyArticleMedia({
    markdown: [
      `![Allowed](${allowed})`,
      "[Documentation](https://docs.example.test/guide)",
      "```markdown",
      "![Code lookalike](https://images.example.test/code.png)",
      "```",
    ].join("\n\n"),
    coverUrl: "",
  });
  assert.equal(classification.legacyMediaReview, "clear");

  const { html } = await renderMarkdown("[Documentation](https://docs.example.test/guide)\n\n## Heading");
  assert.match(html, /href="https:\/\/docs\.example\.test\/guide"/);
  assert.match(html, /href="#heading"/);
});

test("removes raw executable markup, event handlers, styles, and unsafe URL protocols after transforms", async () => {
  const { html } = await renderMarkdown([
    "# Still safe",
    "",
    "<script>alert('script')</script>",
    "<style>body { display: none }</style>",
    "<img src=\"https://example.com/x.png\" onerror=\"alert(1)\">",
    "",
    "[script link](javascript:alert(1))",
    "[data link](data:text/html;base64,PHNjcmlwdD4=)",
    "[mail link](mailto:attacker@example.com)",
    "[file link](ftp://example.com/payload)",
    "![data image](data:image/svg+xml,<svg onload=alert(1)></svg>)",
    "",
    "```html",
    "<script>alert('shown as code')</script>",
    "```",
  ].join("\n"));

  assert.match(html, /<h1>Still safe<\/h1>/);
  assert.match(html, /class="shiki github-light"/);
  assert.doesNotMatch(html, /<script|<style|onerror=|onload=|href="(?:javascript|data|mailto|ftp):|src="data:/i);
});

test("assigns stable Unicode heading IDs and returns only h2/h3 ToC entries", async () => {
  const markdown = [
    "# Document title",
    "",
    "## 架构 / API",
    "",
    "### Café ＡＰＩ",
    "",
    "## 架构 / API",
    "",
    "## Repeat",
    "",
    "## Repeat",
    "",
    "## Repeat-2",
    "",
    "### !!!",
    "",
    "### ???",
    "",
    "### [Nested `Code`](https://example.com) & *emphasis*",
    "",
    "#### Omitted subsection",
  ].join("\n");

  const first = await renderMarkdown(markdown);
  const second = await renderMarkdown(markdown);

  assert.deepEqual(first, second, "the renderer must preserve externally visible anchors");
  assert.deepEqual(first.toc, [
    { id: "架构-api", depth: 2, text: "架构 / API" },
    { id: "café-api", depth: 3, text: "Café ＡＰＩ" },
    { id: "架构-api-2", depth: 2, text: "架构 / API" },
    { id: "repeat", depth: 2, text: "Repeat" },
    { id: "repeat-2", depth: 2, text: "Repeat" },
    { id: "repeat-2-2", depth: 2, text: "Repeat-2" },
    { id: "section", depth: 3, text: "!!!" },
    { id: "section-2", depth: 3, text: "???" },
    { id: "nested-code-emphasis", depth: 3, text: "Nested Code & emphasis" },
  ]);
  assert.match(first.html, /<h2 id="架构-api">架构 \/ API<a [^>]*href="#架构-api"/);
  assert.match(first.html, /<h3 id="café-api">Café ＡＰＩ<a [^>]*href="#café-api"/);
  assert.match(first.html, /class="heading-permalink"/);
  assert.match(first.html, /aria-label="链接到“架构 \/ API”"/);
  assert.doesNotMatch(first.html, /<h1 id=|<h4 id=/);
});

test("keeps generated heading anchors safe when heading Markdown is hostile", async () => {
  const { html, toc } = await renderMarkdown([
    "## [Safe label](javascript:alert(1)) <img src=x onerror=alert(1)>",
    "",
    "### \" onmouseover=\"alert(1)",
    "",
    "<script>alert(1)</script>",
  ].join("\n"));

  assert.deepEqual(toc, [
    { id: "safe-label", depth: 2, text: "Safe label" },
    { id: "onmouseover-alert-1", depth: 3, text: "\" onmouseover=\"alert(1)" },
  ]);
  assert.match(html, /<h2 id="safe-label">/);
  assert.match(html, /href="#safe-label"/);
  assert.doesNotMatch(html, /javascript:|<script|<img|<[^>]*\s(?:onerror|onmouseover)="[^"]*"[^>]*>/i);
});

test("hostile raw Markdown cannot escape supported highlighter output", async () => {
  const { html } = await renderMarkdown([
    "<iframe src=javascript:alert(1)></iframe>",
    "<svg><a href=javascript:alert(1)>bad</a></svg>",
    "[vbscript](vbscript:msgbox(1))",
    "```ts",
    "</span><img src=x onerror=alert(1)>",
    "```",
  ].join("\n\n"));
  assert.match(html, /class="shiki github-light"/);
  assert.doesNotMatch(html, /<iframe|<svg|<img|javascript:|vbscript:|onerror=/i);
});
