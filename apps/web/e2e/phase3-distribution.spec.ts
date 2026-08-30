import { expect, test, type Page } from "@playwright/test";
import { portableExportManifestSchema } from "@blog-x/contracts";
import { readFile } from "node:fs/promises";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const runId = process.env.E2E_RUN_ID;
const webOrigin = process.env.E2E_WEB_ORIGIN;

if (!username || !password || !runId || !webOrigin) {
  throw new Error("E2E_WEB_ORIGIN, E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD, and E2E_RUN_ID are required for the managed Phase 3 journey");
}

const origin = new URL(webOrigin).origin;
if (origin !== webOrigin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(webOrigin)) {
  throw new Error("E2E_WEB_ORIGIN must be the exact runner-generated loopback Web origin");
}
const forbiddenInternalHostnames = [
  ["124", "222", "91", "230"].join("."),
  ["47", "99", "80", "8"].join("."),
];

async function login(page: Page) {
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
}

async function publishArticle(page: Page, ordinal: number, category: string, tag: string) {
  const slug = `phase-3-metadata-${runId}-${ordinal}`;
  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(`Phase 3 metadata article ${ordinal}`);
  await page.getByLabel("摘要").fill(`Phase 3 summary ${ordinal}`);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("SEO 描述").fill(`Phase 3 SEO description ${ordinal}`);
  await page.getByLabel("分类").selectOption({ label: category });
  await page.getByRole("checkbox", { name: tag }).check();
  await page.getByLabel("Markdown").fill(`# Article ${ordinal}\n\nVisible body.`);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
  return { slug, title: `Phase 3 metadata article ${ordinal}`, description: `Phase 3 SEO description ${ordinal}` };
}

async function createTaxonomy(page: Page) {
  const categorySlug = `phase-3-category-${runId}`;
  const tagSlug = `phase-3-tag-${runId}`;
  await page.goto(`${webOrigin}/admin/taxonomy`);
  const categories = page.getByRole("region", { name: "分类管理" });
  await categories.getByLabel("名称").fill("Phase 3 分类");
  await categories.getByLabel("Slug").fill(categorySlug);
  await categories.getByRole("button", { name: "创建分类" }).click();
  await expect(categories.getByRole("status")).toHaveText("分类已创建。");
  const tags = page.getByRole("region", { name: "标签管理" });
  await tags.getByLabel("名称").fill("Phase 3 标签");
  await tags.getByLabel("Slug").fill(tagSlug);
  await tags.getByRole("button", { name: "创建标签" }).click();
  await expect(tags.getByRole("status")).toHaveText("标签已创建。");
  return { category: { name: "Phase 3 分类", slug: categorySlug }, tag: { name: "Phase 3 标签", slug: tagSlug } };
}

async function publishAbout(page: Page) {
  await page.goto(`${webOrigin}/admin/about`);
  await page.getByLabel("标题").fill("Phase 3 关于页");
  await page.getByLabel("Markdown").fill("# About\n\nPublic Phase 3 about.");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByRole("status", { name: "关于页编辑状态" })).toHaveText("关于页已发布。");
}

async function createHiddenDraft(page: Page) {
  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(`phase-3-hidden-${runId}`);
  await page.getByLabel("摘要").fill(`phase-3-hidden-${runId}`);
  await page.getByLabel("Slug").fill(`phase-3-hidden-${runId}`);
  await page.getByLabel("Markdown").fill("# Hidden");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
}

async function expectCompleteHead(page: Page, expected: { title: string; description: string; url: string; type: "article" | "website"; documentTitle?: string }) {
  await expect.poll(() => page.title()).toBe(expected.documentTitle ?? (expected.type === "article" ? `${expected.title} | Blog X` : expected.title));
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", expected.description);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", expected.url);
  for (const [property, value] of Object.entries({
    "og:title": expected.title,
    "og:description": expected.description,
    "og:type": expected.type,
    "og:url": expected.url,
    "og:site_name": "Blog X",
  })) await expect(page.locator(`meta[property="${property}"]`)).toHaveAttribute("content", value);
}

function expectSafeSitemapLocations(locations: string[], hiddenSlug: string) {
  for (const location of locations) {
    const url = new URL(location);
    const pathname = decodeURIComponent(url.pathname);
    const pathSegments = pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
    const queryEntries = [...url.searchParams.entries()].map(([key, value]) => [key.toLowerCase(), value.toLowerCase()] as const);

    expect(url.origin).toBe(webOrigin);
    expect(url.username).toBe("");
    expect(url.password).toBe("");
    expect(url.hash).toBe("");
    expect(pathname).not.toMatch(/^\/(?:admin|login|api)(?:\/|$)/i);
    expect(url.searchParams.getAll("page")).not.toContain("1");
    expect(pathname).not.toBe(`/posts/${hiddenSlug}`);
    expect(pathSegments).not.toContain("internal_api_origin");
    expect(queryEntries.some(([key, value]) => key === "internal_api_origin" || value === "internal_api_origin")).toBe(false);
    expect(forbiddenInternalHostnames).not.toContain(url.hostname);
  }
}

test("sitemap safety checks exact URL structure", () => {
  const hiddenSlug = `phase-3-hidden-${runId}`;
  expect(() => expectSafeSitemapLocations([
    `${webOrigin}/?page=10`,
    `${webOrigin}/?page=11`,
    `${webOrigin}/posts/admin-login-api-page=1-story`,
  ], hiddenSlug)).not.toThrow();
  for (const forbidden of [
    `${webOrigin}/?page=1`,
    `${webOrigin}/admin`,
    `${webOrigin}/login/session`,
    `${webOrigin}/api/public/articles`,
    `${webOrigin}/posts/${hiddenSlug}`,
    `${webOrigin}/posts/public?INTERNAL_API_ORIGIN=value`,
    ...forbiddenInternalHostnames.map((hostname) => `http://${hostname}/public`),
  ]) expect(() => expectSafeSitemapLocations([forbidden], hiddenSlug)).toThrow();
});

test("Phase 3 metadata is a managed same-origin public journey", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!/^https?:/.test(request.url())) return;
    expect(new URL(request.url()).origin).toBe(webOrigin);
    requests.push(request.url());
  });

  await login(page);
  const taxonomy = await createTaxonomy(page);
  const articles = [];
  for (let ordinal = 1; ordinal <= 11; ordinal += 1) articles.push(await publishArticle(page, ordinal, taxonomy.category.name, taxonomy.tag.name));
  await publishAbout(page);
  await createHiddenDraft(page);
  const article = articles[0]!;

  await page.goto(`${webOrigin}/admin`);
  const [download, exportRequest, exportResponse] = await Promise.all([
    page.waitForEvent("download"),
    page.waitForRequest((request) => request.method() === "POST" && request.url() === `${webOrigin}/api/admin/export`),
    page.waitForResponse((response) => response.request().method() === "POST" && response.url() === `${webOrigin}/api/admin/export`),
    page.getByRole("button", { name: "导出文章 Markdown" }).click(),
  ]);
  expect(exportRequest.headers()["origin"]).toBe(webOrigin);
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-disposition"]).toBe('attachment; filename="blog-x-export-v1.json"');
  expect(exportResponse.headers()["content-type"]).toContain("application/json");
  expect(download.suggestedFilename()).toBe("blog-x-export-v1.json");
  const archivePath = testInfo.outputPath("blog-x-export-v1.json");
  await download.saveAs(archivePath);
  const archive = portableExportManifestSchema.parse(JSON.parse(await readFile(archivePath, "utf8")));
  expect(archive.format).toBe("blog-x-portable-export");
  expect(archive.version).toBe(1);
  expect(archive.articles.some((item) => item.slug === article.slug)).toBe(true);
  expect(archive.articles.some((item) => item.slug === `phase-3-hidden-${runId}`)).toBe(true);

  await page.goto(webOrigin);
  await expectCompleteHead(page, { title: "最新文章", description: "记录代码、系统与长期实践。", url: webOrigin, type: "website" });
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute("href", `${webOrigin}/rss.xml`);
  await page.goto(`${webOrigin}/?page=1`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", webOrigin);
  await page.goto(`${webOrigin}/?page=2`);
  await expectCompleteHead(page, { title: "最新文章", description: "记录代码、系统与长期实践。", url: `${webOrigin}/?page=2`, type: "website" });
  for (const query of ["page=01", "page=0", "page=3", "page=1&page=2", "page=1&extra=x", "page=two"]) {
    await page.goto(`${webOrigin}/?${query}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }

  await page.goto(`${webOrigin}/posts/${article.slug}`);
  await expectCompleteHead(page, { title: article.title, description: article.description, url: `${webOrigin}/posts/${article.slug}`, type: "article" });
  const missing = await page.goto(`${webOrigin}/posts/missing-${runId}`);
  expect(missing?.status()).toBe(404);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

  await page.goto(`${webOrigin}/categories`);
  await expectCompleteHead(page, { title: "分类", description: "浏览公开文章分类。", url: `${webOrigin}/categories`, type: "website", documentTitle: "分类 | Blog X" });
  await page.goto(`${webOrigin}/categories/${taxonomy.category.slug}`);
  await expectCompleteHead(page, { title: "Phase 3 分类 分类", description: "Phase 3 分类 分类下的 11 篇已发布文章。", url: `${webOrigin}/categories/${taxonomy.category.slug}`, type: "website", documentTitle: "Phase 3 分类 分类 | Blog X" });
  for (const query of ["page=1", "page=2"]) {
    await page.goto(`${webOrigin}/categories/${taxonomy.category.slug}?${query}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", query === "page=1" ? `${webOrigin}/categories/${taxonomy.category.slug}` : `${webOrigin}/categories/${taxonomy.category.slug}?page=2`);
  }
  for (const query of ["page=01", "page=3", "page=1&page=2", "page=1&extra=x"]) {
    await page.goto(`${webOrigin}/categories/${taxonomy.category.slug}?${query}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
  expect((await page.goto(`${webOrigin}/categories/missing-${runId}`))?.status()).toBe(404);

  await page.goto(`${webOrigin}/tags`);
  await expectCompleteHead(page, { title: "标签", description: "浏览公开文章标签。", url: `${webOrigin}/tags`, type: "website", documentTitle: "标签 | Blog X" });
  await page.goto(`${webOrigin}/tags/${taxonomy.tag.slug}?page=2`);
  await expectCompleteHead(page, { title: "Phase 3 标签 标签", description: "Phase 3 标签 标签下的 11 篇已发布文章。", url: `${webOrigin}/tags/${taxonomy.tag.slug}?page=2`, type: "website", documentTitle: "Phase 3 标签 标签 | Blog X" });
  await page.goto(`${webOrigin}/tags/${taxonomy.tag.slug}?page=01`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  expect((await page.goto(`${webOrigin}/tags/missing-${runId}`))?.status()).toBe(404);

  await page.goto(`${webOrigin}/archives`);
  await expectCompleteHead(page, { title: "归档", description: "按时间浏览已发布文章。", url: `${webOrigin}/archives`, type: "website", documentTitle: "归档 | Blog X" });
  await page.goto(`${webOrigin}/about`);
  await expectCompleteHead(page, { title: "Phase 3 关于页", description: "了解 Phase 3 关于页。", url: `${webOrigin}/about`, type: "website", documentTitle: "Phase 3 关于页 | Blog X" });

  const robots = await page.request.get(`${webOrigin}/robots.txt`);
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/User-Agent: \*\nAllow: \/\nDisallow: \/admin\nDisallow: \/login\nDisallow: \/api\n\nSitemap: .*\/sitemap\.xml/);
  const sitemap = await page.request.get(`${webOrigin}/sitemap.xml`);
  const sitemapText = await sitemap.text();
  expect(sitemap.status()).toBe(200);
  const locations = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
  const hiddenSlug = `phase-3-hidden-${runId}`;
  const expectedLocations = new Set([
    `${webOrigin}/`, `${webOrigin}/?page=2`, `${webOrigin}/categories`, `${webOrigin}/categories/${taxonomy.category.slug}`, `${webOrigin}/categories/${taxonomy.category.slug}?page=2`,
    `${webOrigin}/tags`, `${webOrigin}/tags/${taxonomy.tag.slug}`, `${webOrigin}/tags/${taxonomy.tag.slug}?page=2`, `${webOrigin}/archives`, `${webOrigin}/about`,
    ...articles.map((item) => `${webOrigin}/posts/${item.slug}`),
  ]);
  expect(locations).toHaveLength(expectedLocations.size);
  expect(new Set(locations)).toEqual(expectedLocations);
  expectSafeSitemapLocations(locations, hiddenSlug);
  const feed = await page.request.get(`${webOrigin}/rss.xml`);
  const feedText = await feed.text();
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");
  expect(feedText).toContain(`${webOrigin}/posts/${article.slug}`);
  expect(feedText).not.toMatch(/(?:hidden|draft|INTERNAL_API_ORIGIN|124\.222|47\.99)/i);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((request) => new URL(request).origin === webOrigin)).toBe(true);
  await testInfo.attach("phase3-home-head", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
