import { expect, test, type Page } from "@playwright/test";

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

async function login(page: Page) {
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
}

async function publishArticle(page: Page, ordinal: number) {
  const slug = `phase-3-metadata-${runId}-${ordinal}`;
  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(`Phase 3 metadata article ${ordinal}`);
  await page.getByLabel("摘要").fill(`Phase 3 summary ${ordinal}`);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("SEO 描述").fill(`Phase 3 SEO description ${ordinal}`);
  await page.getByLabel("Markdown").fill(`# Article ${ordinal}\n\nVisible body.`);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
  return { slug, title: `Phase 3 metadata article ${ordinal}`, description: `Phase 3 SEO description ${ordinal}` };
}

async function expectCompleteHead(page: Page, expected: { title: string; description: string; url: string; type: "article" | "website" }) {
  await expect.poll(() => page.title()).toBe(expected.type === "article" ? `${expected.title} | Blog X` : expected.title);
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

test("Phase 3 metadata is a managed same-origin public journey", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!/^https?:/.test(request.url())) return;
    expect(new URL(request.url()).origin).toBe(webOrigin);
    requests.push(request.url());
  });

  await login(page);
  const articles = [];
  for (let ordinal = 1; ordinal <= 11; ordinal += 1) articles.push(await publishArticle(page, ordinal));
  const article = articles[0]!;

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
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((request) => new URL(request).origin === webOrigin)).toBe(true);
  await testInfo.attach("phase3-home-head", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
