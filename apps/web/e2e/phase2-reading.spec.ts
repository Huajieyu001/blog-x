import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const runId = process.env.E2E_RUN_ID;
const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";

function crc32(value: Buffer) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii"), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(width: number, height: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  const rows = Array.from({ length: height }, () => {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) row.set([38, 91, 78, 255], 1 + x * 4);
    return row;
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function login(page: Page) {
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
}

test("Phase 2 is one responsive local author-to-reader experience", async ({ page, context }, testInfo) => {
  test.setTimeout(300_000);
  test.skip(!username || !password || !runId, "isolated verification credentials and run id are required");

  const localRequests: string[] = [];
  page.on("request", (request) => {
    if (!/^https?:/.test(request.url())) return;
    const url = new URL(request.url());
    expect(url.origin).toBe(webOrigin);
    localRequests.push(url.pathname);
  });

  await login(page);
  const suffix = runId!;
  const categorySlug = `engineering-${suffix}`;
  const emptyCategorySlug = `empty-${suffix}`;
  const tagSlug = `typescript-${suffix}`;

  await page.goto(`${webOrigin}/admin/taxonomy`);
  const categories = page.getByRole("region", { name: "分类管理" });
  await categories.getByLabel("名称").fill("工程实践");
  await categories.getByLabel("Slug").fill(categorySlug);
  await categories.getByRole("button", { name: "创建分类" }).click();
  await expect(categories.getByRole("status")).toHaveText("分类已创建。");
  await categories.getByRole("button", { name: "编辑工程实践" }).click();
  await categories.getByLabel("名称").fill("软件工程");
  await categories.getByRole("button", { name: "保存更改" }).click();
  await expect(categories.getByRole("status")).toHaveText("分类已更新。");
  await categories.getByLabel("名称").fill("空分类");
  await categories.getByLabel("Slug").fill(emptyCategorySlug);
  await categories.getByRole("button", { name: "创建分类" }).click();

  const tags = page.getByRole("region", { name: "标签管理" });
  await tags.getByLabel("名称").fill("TypeScript");
  await tags.getByLabel("Slug").fill(tagSlug);
  await tags.getByRole("button", { name: "创建标签" }).click();
  await expect(tags.getByRole("status")).toHaveText("标签已创建。");

  const articleSlug = `phase-2-reading-${suffix}`;
  const articleTitle = `从代码到阅读体验 ${suffix}`;
  const summary = "一篇用于验证电脑端、平板端和手机端一致体验的长篇技术文章。";
  const markdown = [
    "## 架构 / Architecture",
    "",
    "这是一段混合中文与 English 的长内容，用于验证窄屏断行、宽屏阅读密度与稳定目录锚点。".repeat(8),
    "",
    "### 数据边界",
    "",
    "| Layer with an intentionally long heading | Responsibility |",
    "| --- | --- |",
    "| Browser | 只读取服务端已经清洗的公开内容 |",
    "",
    "```ts",
    "const intentionallyLongValue = 'abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz';",
    "```",
    "",
    "## 架构 / Architecture",
  ].join("\n");

  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(articleTitle);
  await page.getByLabel("摘要").fill(summary);
  await page.getByLabel("Slug").fill(articleSlug);
  await page.getByLabel("分类").selectOption({ label: "软件工程" });
  await page.getByRole("checkbox", { name: "TypeScript" }).check();
  await page.getByLabel("Markdown").fill(markdown);
  const fileInput = page.getByLabel("上传图片（JPEG、PNG 或 WebP，最大 5 MiB）");
  await fileInput.setInputFiles({ name: "wide-phase2.png", mimeType: "image/png", buffer: png(160, 48) });
  await page.getByTestId("media-alt-text").fill("Phase 2 宽幅架构示意图");
  await page.getByRole("button", { name: "上传图片", exact: true }).click();
  await expect(page.getByText("图片已上传，可插入文章。")).toBeFocused();
  await page.getByRole("button", { name: "插入 Markdown" }).click();
  await page.getByRole("button", { name: "设为封面" }).click();
  const source = await page.getByLabel("Markdown").inputValue();
  const mediaUrl = source.match(/\((\/media\/[0-9a-f-]{36})\)/)?.[1];
  expect(mediaUrl).toBeTruthy();
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();

  await page.goto(`${webOrigin}/admin/about`);
  await page.getByLabel("标题").fill("关于 Blog X");
  await page.getByLabel("Markdown").fill("# 关于这个站点\n\n本博客记录软件工程、阅读与长期维护。\n\n<script>secret()</script>");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "关于页编辑状态" })).toHaveText("草稿已保存。");
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByRole("status", { name: "关于页编辑状态" })).toHaveText("关于页已发布。");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(webOrigin);
  await expect(page.getByTestId("public-header")).toBeVisible();
  const card = page.getByTestId("post-card").filter({ hasText: articleTitle });
  await expect(card).toContainText("分类：软件工程");
  await expect(card).toContainText("#TypeScript");
  await page.getByRole("radio", { name: "深色" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.goto(`${webOrigin}/categories/${categorySlug}`);
  await expect(page.getByRole("heading", { level: 1, name: "软件工程" })).toBeVisible();
  await expect(page.getByRole("link", { name: articleTitle, exact: true })).toBeVisible();
  await page.goto(`${webOrigin}/tags/${tagSlug}`);
  await expect(page.getByRole("heading", { level: 1, name: "TypeScript" })).toBeVisible();
  await page.goto(`${webOrigin}/archives`);
  await expect(page.getByRole("link", { name: articleTitle })).toBeVisible();
  await page.goto(`${webOrigin}/about`);
  await expect(page.getByRole("heading", { level: 1, name: "关于 Blog X" })).toBeVisible();
  await expect(page.getByTestId("article-body").locator("script, style, [onerror], [onclick]")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const articleResponse = await page.goto(`${webOrigin}/posts/${articleSlug}`);
  expect(articleResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: articleTitle })).toBeVisible();
  await expect(page.locator(`img[src="${mediaUrl}"]`)).toHaveCount(2);
  await expect(page.locator(`img[src="${mediaUrl}"]`).first()).toHaveAttribute("alt", "Phase 2 宽幅架构示意图");
  const toc = page.getByTestId("article-toc");
  await expect(toc.getByRole("link", { name: "架构 / Architecture", exact: true })).toHaveCount(2);
  const tocHrefs = await toc.getByRole("link", { name: "架构 / Architecture", exact: true }).evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(tocHrefs).toEqual(["#架构-architecture", "#架构-architecture-2"]);
  expect((await context.request.get(`${webOrigin}${mediaUrl}`)).headers()["cache-control"]).toContain("immutable");

  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${webOrigin}/posts/${articleSlug}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await testInfo.attach(`phase2-${viewport.width}x${viewport.height}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }

  await page.setViewportSize({ width: 375, height: 812 });
  const menu = page.getByTestId("mobile-menu-toggle");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "站点导航" }).getByRole("link", { name: "归档" })).toBeVisible();
  await expect(page.locator("details").filter({ hasText: "文章目录" })).toBeVisible();

  const emptyResponse = await page.goto(`${webOrigin}/categories/${emptyCategorySlug}`);
  expect(emptyResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "这一页还没有文章" })).toBeVisible();
  const unknownResponse = await page.goto(`${webOrigin}/categories/not-a-real-${suffix}`);
  expect(unknownResponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "没有找到这个页面" })).toBeVisible();
  await page.goto(`${webOrigin}/categories/${categorySlug}?page=0`);
  await expect(page.getByRole("heading", { name: "页码无效" })).toBeVisible();

  expect(localRequests.some((path) => path.startsWith("/api/admin/media"))).toBe(true);
  expect(localRequests.some((path) => path === mediaUrl)).toBe(true);
});
