import assert from "node:assert/strict";
import test from "node:test";
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
    "",
    "![Architecture](https://images.example.com/architecture.png)",
    "",
    "```ts",
    "const answer: number = 42;",
    "```",
    "",
    "```not-a-real-language",
    "<button onclick=\"steal()\">escaped</button>",
    "```",
  ].join("\n");

  const html = await renderMarkdown(markdown);

  assert.match(html, /<h1>Technical note<\/h1>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<table>/);
  assert.match(html, /href="https:\/\/example\.com\/docs"/);
  assert.match(html, /src="https:\/\/images\.example\.com\/architecture\.png"/);
  assert.match(html, /class="shiki github-light"/);
  assert.match(html, /language-not-a-real-language/);
  assert.match(html, /&#x3C;button onclick="steal\(\)"/);
  assert.doesNotMatch(html, /<button/i);
});

test("removes raw executable markup, event handlers, styles, and unsafe URL protocols after transforms", async () => {
  const html = await renderMarkdown([
    "# Still safe",
    "",
    "<script>alert('script')</script>",
    "<style>body { display: none }</style>",
    "<img src=\"https://example.com/x.png\" onerror=\"alert(1)\">",
    "",
    "[script link](javascript:alert(1))",
    "[data link](data:text/html;base64,PHNjcmlwdD4=)",
    "![data image](data:image/svg+xml,<svg onload=alert(1)></svg>)",
    "",
    "```html",
    "<script>alert('shown as code')</script>",
    "```",
  ].join("\n"));

  assert.match(html, /<h1>Still safe<\/h1>/);
  assert.match(html, /class="shiki github-light"/);
  assert.doesNotMatch(html, /<script|<style|onerror=|onload=|href="(?:javascript|data):|src="data:/i);
});
