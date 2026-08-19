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

async function expectMinimumHeight(locator: import("@playwright/test").Locator, minimum = 44) {
  const height = await locator.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(minimum);
}

async function expectKeyboardFocus(locator: import("@playwright/test").Locator) {
  const focus = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset),
    };
  });
  expect(focus.focusVisible).toBe(true);
  expect(focus.outlineStyle).not.toBe("none");
  expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(focus.outlineOffset).toBeGreaterThanOrEqual(4);
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

test.describe("responsive discovery implementation", () => {
  const responsiveTitles = Array.from({ length: 10 }, (_, index) => index === 0
    ? "响应式长标题 LongResponsiveTitleWithoutBreakOpportunity".repeat(4)
    : `响应式搜索结果 ${index + 1}`);
  const relatedTitles = [1, 2, 3, 4].map((position) => `相关阅读 ${position}：保持 API 顺序`);
  const viewports = [
    { width: 375, height: 812, relatedColumns: 1 },
    { width: 768, height: 1024, relatedColumns: 2 },
    { width: 1280, height: 900, relatedColumns: 2 },
  ];

  test("keeps one information order, expected columns, 44px targets and zero overflow at 375 768 1280", async ({ page }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    const forbiddenFixtureOrigin = requireGeneratedOrigin(fixtureOrigin, "E2E_DISCOVERY_FIXTURE_ORIGIN");
    const browserRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) browserRequests.push(request.url());
    });

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`${expectedOrigin}/search?q=${encodeURIComponent("响应式")}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      const pageForm = page.locator("main").getByRole("search", { name: "搜索文章" });
      await expectMinimumHeight(pageForm.getByRole("searchbox", { name: "搜索文章" }));
      await expectMinimumHeight(pageForm.getByRole("button", { name: "搜索", exact: true }));
      const resultCards = page.getByTestId("post-card");
      await expect(resultCards).toHaveCount(10);
      await expect(resultCards.locator("h3")).toHaveText(responsiveTitles);
      expect(await resultCards.first().locator("h3").evaluate((element) => ({
        fits: element.scrollWidth <= element.clientWidth,
        ellipsis: getComputedStyle(element).textOverflow === "ellipsis",
      }))).toEqual({ fits: true, ellipsis: false });

      const pagination = page.getByRole("navigation", { name: "搜索结果分页" });
      for (const control of await pagination.locator("a").all()) await expectMinimumHeight(control);

      const headerNav = page.getByRole("navigation", { name: "站点导航" });
      if (viewport.width < 1024) {
        const toggle = page.getByTestId("mobile-menu-toggle");
        await expectMinimumHeight(toggle);
        await toggle.click();
        await expectMinimumHeight(headerNav.getByRole("searchbox", { name: "搜索文章" }));
        await expectMinimumHeight(headerNav.getByRole("button", { name: "搜索", exact: true }));
      } else {
        await expectMinimumHeight(headerNav.getByRole("searchbox", { name: "搜索文章" }));
        await expectMinimumHeight(headerNav.getByRole("button", { name: "搜索", exact: true }));
      }

      await page.goto(`${expectedOrigin}/posts/related-populated`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const related = page.getByTestId("related-reading");
      await expect(related.getByTestId("post-card").locator("h3")).toHaveText(relatedTitles);
      const columns = await related.locator(":scope > div").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
      expect(columns).toBe(viewport.relatedColumns);
    }

    for (const url of browserRequests) expect(new URL(url).origin).toBe(expectedOrigin);
    const rendered = await page.content();
    expect(rendered).not.toContain(forbiddenFixtureOrigin);
    expect(rendered).not.toContain("INTERNAL_API_ORIGIN");
  });

  test("compact menu excludes hidden controls, supports keyboard submit and restores focus with Escape", async ({ page }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");

    for (const viewport of viewports.slice(0, 2)) {
      await page.setViewportSize(viewport);
      await page.goto(`${expectedOrigin}/`);
      const toggle = page.getByTestId("mobile-menu-toggle");
      const nav = page.getByRole("navigation", { name: "站点导航" });
      await expect(nav).toBeHidden();
      expect(await nav.locator("a, input, button").evaluateAll((elements) => elements.every((element) => (element as HTMLElement).tabIndex === -1))).toBe(true);

      await toggle.focus();
      await toggle.press("Enter");
      await expect(nav).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(nav.getByRole("link", { name: "文章", exact: true })).toBeFocused();
      for (let step = 0; step < 4; step += 1) await page.keyboard.press("Tab");
      await expect(nav.getByRole("link", { name: "关于", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      const input = nav.getByRole("searchbox", { name: "搜索文章" });
      await expect(input).toBeFocused();
      await input.fill("响应式");
      if (viewport.width === 375) await input.press("Enter");
      else await nav.getByRole("button", { name: "搜索", exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/search" && url.searchParams.get("q") === "响应式");
      await expect(page.getByRole("heading", { name: "“响应式” 的搜索结果" })).toBeVisible();

      await page.goto(`${expectedOrigin}/`);
      const nextToggle = page.getByTestId("mobile-menu-toggle");
      await nextToggle.click();
      await page.getByRole("navigation", { name: "站点导航" }).getByRole("searchbox", { name: "搜索文章" }).focus();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("navigation", { name: "站点导航" })).toBeHidden();
      await expect(nextToggle).toBeFocused();
    }
  });

  test("keeps theme focus and native no-JavaScript search usable without cross-origin requests", async ({ page, browser }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${expectedOrigin}/search?q=${encodeURIComponent("响应式")}`);
    const pageForm = page.locator("main").getByRole("search", { name: "搜索文章" });
    const input = pageForm.getByRole("searchbox", { name: "搜索文章" });
    const button = pageForm.getByRole("button", { name: "搜索", exact: true });
    const theme = page.getByTestId("theme-toggle");

    for (const preference of ["浅色", "深色", "跟随系统"] as const) {
      if (preference === "跟随系统") await page.emulateMedia({ colorScheme: "dark" });
      await theme.getByLabel(preference).check();
      const colors = await page.locator("main").evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor };
      });
      expect(colors.color).not.toBe(colors.background);

      await input.focus();
      await page.keyboard.press("Tab");
      await expect(button).toBeFocused();
      await expectKeyboardFocus(button);
      await page.keyboard.press("Shift+Tab");
      await expect(input).toBeFocused();
      await expectKeyboardFocus(input);
    }

    const noScript = await browser.newContext({
      javaScriptEnabled: false,
      colorScheme: "dark",
      viewport: { width: 375, height: 812 },
    });
    const noScriptPage = await noScript.newPage();
    const noScriptRequests: string[] = [];
    noScriptPage.on("request", (request) => {
      if (/^https?:/.test(request.url())) noScriptRequests.push(request.url());
    });
    await noScriptPage.goto(`${expectedOrigin}/`);
    const noScriptForm = noScriptPage.getByRole("navigation", { name: "站点导航" }).getByRole("search", { name: "搜索文章" });
    await expect(noScriptForm).toBeVisible();
    await noScriptForm.getByRole("searchbox", { name: "搜索文章" }).fill("响应式");
    await noScriptForm.getByRole("searchbox", { name: "搜索文章" }).press("Enter");
    await expect(noScriptPage.getByRole("heading", { name: "“响应式” 的搜索结果" })).toBeVisible();
    expect(await noScriptPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const url of noScriptRequests) expect(new URL(url).origin).toBe(expectedOrigin);
    await noScript.close();
  });
});
