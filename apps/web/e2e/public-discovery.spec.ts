import { expect, test } from "@playwright/test";

const webOrigin = process.env.E2E_WEB_ORIGIN ?? "";
const fixtureOrigin = process.env.E2E_DISCOVERY_FIXTURE_ORIGIN ?? "";

function requireGeneratedOrigin(value: string, label: string) {
  const parsed = new URL(value);
  if (parsed.origin !== value || parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.port) {
    throw new Error(`${label} must be a generated loopback HTTP origin`);
  }
  return parsed.origin;
}

test("desktop search tracer", async ({ page, browser }) => {
  const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
  const forbiddenFixtureOrigin = requireGeneratedOrigin(fixtureOrigin, "E2E_DISCOVERY_FIXTURE_ORIGIN");
  expect(forbiddenFixtureOrigin).not.toBe(expectedOrigin);

  const browserRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) browserRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${expectedOrigin}/`);

  const nav = page.getByRole("navigation", { name: "站点导航" });
  await expect(nav.getByRole("link")).toHaveText(["文章", "分类", "标签", "归档", "关于", "管理"]);
  const orderedChildren = await nav.locator(":scope > *").evaluateAll((elements) => elements.map((element) => ({
    tag: element.tagName.toLowerCase(),
    text: element.textContent?.replace(/\s+/g, "").trim(),
  })));
  expect(orderedChildren.map(({ tag }) => tag)).toEqual(["a", "a", "a", "a", "a", "form", "a"]);
  expect(orderedChildren[5]?.text).toContain("搜索文章");

  const headerForm = nav.getByRole("search", { name: "搜索文章" });
  const headerInput = headerForm.getByRole("searchbox", { name: "搜索文章" });
  await expect(headerInput).toHaveAttribute("maxlength", "256");
  await expect(headerForm.getByRole("button", { name: "搜索", exact: true })).toHaveCSS("min-height", "44px");
  const requestsBeforeTyping = browserRequests.length;
  await headerInput.fill("中文 & React");
  await page.waitForTimeout(100);
  expect(browserRequests).toHaveLength(requestsBeforeTyping);

  await headerInput.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === "/search" && url.searchParams.get("q") === "中文 & React");
  await expect(page.getByRole("heading", { name: "“中文 & React” 的搜索结果" })).toBeVisible();
  await expect(page.getByText("找到 1 篇文章 · 第 1 页")).toBeVisible();
  const resultCard = page.getByTestId("post-card");
  await expect(resultCard).toHaveCount(1);
  await expect(resultCard.getByRole("link", { name: "中文 & React：一条可信搜索结果", exact: true })).toHaveAttribute("href", "/posts/trusted-search-result");
  await expect(resultCard.getByText("严格公开摘要 <script> 不会作为标记执行")).toBeVisible();
  await expect(resultCard.locator("script")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/markdown|score|match|draft|unpublished|deleted/i);
  await expect(page.locator("form[role='search']")).toHaveCount(2);
  await expect(page.locator("form[role='search'][aria-current]")).toHaveCount(0);

  for (const url of browserRequests) expect(new URL(url).origin).toBe(expectedOrigin);
  const rendered = await page.content();
  expect(rendered).not.toContain(forbiddenFixtureOrigin);
  expect(rendered).not.toContain("INTERNAL_API_ORIGIN");
  expect(rendered).not.toContain(["124", "222", "91", "230"].join("."));
  expect(rendered).not.toContain(["47", "99", "80", "8"].join("."));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.goto(`${expectedOrigin}/search`);
  await expect(page.getByRole("heading", { name: "请输入搜索内容" })).toBeVisible();
  await expect(page.getByTestId("post-card")).toHaveCount(0);

  await page.goto(`${expectedOrigin}/search?q=partial`);
  await expect(page.getByRole("heading", { name: "暂时无法完成搜索" })).toBeVisible();
  await expect(page.getByText(/incomplete result/)).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${expectedOrigin}/`);
  const toggle = page.getByTestId("mobile-menu-toggle");
  const compactInput = page.getByRole("searchbox", { name: "搜索文章", includeHidden: true });
  await expect(compactInput).toHaveAttribute("tabindex", "-1");
  await toggle.click();
  await expect(compactInput).toBeVisible();
  await expect(compactInput).not.toHaveAttribute("tabindex", "-1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(`${expectedOrigin}/`);
  const noScriptForm = noScriptPage.getByRole("search", { name: "搜索文章" });
  await expect(noScriptForm).toBeVisible();
  await noScriptForm.getByRole("searchbox", { name: "搜索文章" }).fill("中文 & React");
  await noScriptForm.getByRole("searchbox", { name: "搜索文章" }).press("Enter");
  await expect(noScriptPage.getByRole("heading", { name: "“中文 & React” 的搜索结果" })).toBeVisible();
  expect(await noScriptPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await noScript.close();
});

test.describe("related populated zero and failure", () => {
  test("renders four strict related cards after the complete article in API order", async ({ page }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    const forbiddenFixtureOrigin = requireGeneratedOrigin(fixtureOrigin, "E2E_DISCOVERY_FIXTURE_ORIGIN");
    const browserRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) browserRequests.push(request.url());
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    const response = await page.goto(`${expectedOrigin}/posts/related-populated`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "主文章 related-populated" })).toBeVisible();
    await expect(page.getByTestId("article-body")).toContainText("完整正文内容仍然可读。");
    await expect(page.getByRole("link", { name: "正文尾部的永久链接" })).toHaveAttribute("href", "#article-ending");

    const related = page.getByTestId("related-reading");
    await expect(related.getByRole("heading", { level: 2, name: "继续阅读" })).toBeVisible();
    const cards = related.getByTestId("post-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.locator("h3")).toHaveText([
      "相关阅读 1：保持 API 顺序",
      "相关阅读 2：保持 API 顺序",
      "相关阅读 3：保持 API 顺序",
      "相关阅读 4：保持 API 顺序",
    ]);
    await expect(related.getByText("主文章 related-populated")).toHaveCount(0);
    await expect(related).not.toContainText(/markdown|score|rank|shared|internal|draft|deleted/i);
    expect(await page.evaluate(() => {
      const body = document.querySelector('[data-testid="article-body"]');
      const relatedSection = document.querySelector('[data-testid="related-reading"]');
      return Boolean(body && relatedSection && (body.compareDocumentPosition(relatedSection) & Node.DOCUMENT_POSITION_FOLLOWING));
    })).toBe(true);

    for (const url of browserRequests) expect(new URL(url).origin).toBe(expectedOrigin);
    expect(await page.content()).not.toContain(forbiddenFixtureOrigin);
  });

  test("hides the complete related section for a strict zero response", async ({ page }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    await page.goto(`${expectedOrigin}/posts/related-zero`);
    await expect(page.getByRole("heading", { level: 1, name: "主文章 related-zero" })).toBeVisible();
    await expect(page.getByTestId("article-body")).toContainText("完整正文内容仍然可读。");
    await expect(page.getByTestId("related-reading")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "继续阅读" })).toHaveCount(0);
    await expect(page.getByTestId("related-recovery")).toHaveCount(0);
  });

  for (const slug of ["related-failure", "related-malformed"] as const) {
    test(`keeps the primary article and renders local recovery for ${slug}`, async ({ page }) => {
      const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
      const response = await page.goto(`${expectedOrigin}/posts/${slug}`);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(`${expectedOrigin}/posts/${slug}`);
      await expect(page.getByRole("heading", { level: 1, name: `主文章 ${slug}` })).toBeVisible();
      await expect(page.getByTestId("article-body")).toContainText("完整正文内容仍然可读。");
      await expect(page.getByRole("link", { name: "正文尾部的永久链接" })).toHaveAttribute("href", "#article-ending");
      const recovery = page.getByTestId("related-recovery");
      await expect(recovery.getByRole("heading", { level: 2, name: "相关文章暂时不可用" })).toBeVisible();
      await expect(recovery).toContainText("文章内容不受影响，你可以继续阅读或返回最新文章。");
      await expect(recovery.getByRole("link", { name: "返回最新文章" })).toHaveAttribute("href", "/");
      await expect(page.getByTestId("related-reading")).toHaveCount(0);
      await expect(page.getByText("没有找到这个页面")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "继续阅读" })).toHaveCount(0);
    });
  }
});
