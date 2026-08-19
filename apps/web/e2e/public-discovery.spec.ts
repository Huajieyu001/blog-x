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

const hiddenSentinels = [
  "DRAFT_PRIVATE_SENTINEL",
  "UNPUBLISHED_PRIVATE_SENTINEL",
  "DELETED_PRIVATE_SENTINEL",
  "RAW_MARKDOWN_PRIVATE_SENTINEL",
  "STACK_PRIVATE_SENTINEL",
];

async function expectNoDiscoveryDisclosure(page: import("@playwright/test").Page) {
  const rendered = await page.content();
  for (const sentinel of hiddenSentinels) expect(rendered).not.toContain(sentinel);
  expect(rendered).not.toContain("INTERNAL_API_ORIGIN");
  expect(rendered).not.toContain(["124", "222", "91", "230"].join("."));
  expect(rendered).not.toContain(["47", "99", "80", "8"].join("."));
  expect(rendered).not.toMatch(/(?:ZodError|ECONNREFUSED|sharedTagCount|matchLocation|relevanceScore)/i);
}

async function expectSearchHead(page: import("@playwright/test").Page, canonical?: string) {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  const link = page.locator('link[rel="canonical"]');
  if (canonical) {
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", canonical);
  } else {
    await expect(link).toHaveCount(0);
  }
}

async function fixtureControl(page: import("@playwright/test").Page, mode: "reset" | "stats") {
  const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
  const response = await page.request.get(`${expectedOrigin}/api/control/discovery?mode=${mode}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{ search: Record<string, number>; related: Record<string, number> }>;
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

  test("removes the source and later duplicate while preserving first-occurrence API order", async ({ page }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    await page.goto(`${expectedOrigin}/posts/related-dedup`);
    const related = page.getByTestId("related-reading");
    await expect(related.getByTestId("post-card").locator("h3")).toHaveText([
      "相关阅读 1：保持 API 顺序",
      "相关阅读 2：保持 API 顺序",
    ]);
    await expect(related).not.toContainText("主文章不应出现在相关阅读");
    await expect(related).not.toContainText("重复项不应覆盖第一次出现");
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
      for (const control of await resultCards.locator('[aria-label="文章分类和标签"] a').all()) {
        await expectMinimumHeight(control);
      }
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
      for (const control of await related.locator('[aria-label="文章分类和标签"] a').all()) {
        await expectMinimumHeight(control);
      }
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

test.describe("phase 7 edge and privacy matrix", () => {
  test.beforeEach(async ({ page }) => {
    await fixtureControl(page, "reset");
  });

  test("D-01 D-02 D-03 D-04: UI[loading] native entry has no typing fetch, client authority, spinner or stale substitution", async ({ page }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    const unknownControl = await page.request.get(`${expectedOrigin}/api/control/discovery?mode=unknown`);
    expect(unknownControl.status()).toBe(400);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(expectedOrigin);
    const form = page.getByRole("navigation", { name: "站点导航" }).getByRole("search", { name: "搜索文章" });
    const before = requests.length;
    await form.getByRole("searchbox", { name: "搜索文章" }).fill("matrix-one");
    await page.waitForTimeout(100);
    expect(requests).toHaveLength(before);
    await expect(page.locator('[role="progressbar"], [aria-busy="true"]')).toHaveCount(0);
    await form.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page).toHaveURL(`${expectedOrigin}/search?q=matrix-one`);
    await expect(page.getByTestId("post-card")).toHaveCount(1);
    expect(requests.every((request) => new URL(request).origin === expectedOrigin)).toBe(true);
  });

  test("D-05 D-08 D-09 D-10: UI[empty] UI[populated] UI[partial] UI[zero-one-many] proves EDGE[SRCH-01/adjacency] EDGE[SRCH-01/empty] EDGE[SRCH-01/ordering] and EDGE[SRCH-02/adjacency] EDGE[SRCH-02/empty] EDGE[SRCH-02/ordering] EDGE[SRCH-02/precision]", async ({ page }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");

    await page.goto(`${expectedOrigin}/search`);
    await expect(page.getByRole("heading", { name: "请输入搜索内容" })).toBeVisible();
    await expect(page.getByText("输入标题、摘要或正文中的关键词，即可搜索已发布文章。")).toBeVisible();
    await expect(page.getByRole("link", { name: "返回最新文章" })).toHaveAttribute("href", "/");
    await expect(page.getByTestId("post-card")).toHaveCount(0);

    await page.goto(`${expectedOrigin}/search?q=hidden-only`);
    await expect(page.getByRole("heading", { name: "没有找到匹配文章" })).toBeVisible();
    await expect(page.getByRole("link", { name: "清除搜索" })).toHaveAttribute("href", "/search");
    await expect(page.getByTestId("post-card")).toHaveCount(0);

    await page.goto(`${expectedOrigin}/search?q=matrix-one`);
    await expect(page.getByText("找到 1 篇文章 · 第 1 页")).toBeVisible();
    await expect(page.getByTestId("post-card").locator("h3")).toHaveText(["矩阵结果 01"]);
    await expect(page.getByRole("navigation", { name: "搜索结果分页" })).toHaveCount(0);

    await page.goto(`${expectedOrigin}/search?q=matrix-ten`);
    await expect(page.getByTestId("post-card")).toHaveCount(10);
    await expect(page.getByTestId("post-card").locator("h3")).toHaveText(
      Array.from({ length: 10 }, (_, index) => `矩阵结果 ${String(index + 1).padStart(2, "0")}`),
    );
    await expect(page.getByRole("navigation", { name: "搜索结果分页" })).toHaveCount(0);

    await page.goto(`${expectedOrigin}/search?q=matrix-eleven`);
    const pagination = page.getByRole("navigation", { name: "搜索结果分页" });
    await expect(page.getByTestId("post-card")).toHaveCount(10);
    await expect(pagination.getByRole("link", { name: "第 1 页" })).toHaveAttribute("href", "/search?q=matrix-eleven");
    await expect(pagination.getByRole("link", { name: "第 2 页" })).toHaveAttribute("href", "/search?q=matrix-eleven&page=2");
    await pagination.getByRole("link", { name: "下一页" }).click();
    await expect(page).toHaveURL(`${expectedOrigin}/search?q=matrix-eleven&page=2`);
    await expect(page.getByTestId("post-card").locator("h3")).toHaveText(["矩阵结果 11"]);
    await expect(page.getByText("找到 11 篇文章 · 第 2 页")).toBeVisible();

    await page.goto(`${expectedOrigin}/search?q=matrix-eleven&page=3`);
    await expect(page.getByRole("heading", { name: "这一页没有结果" })).toBeVisible();
    await expect(page.getByText("“matrix-eleven” 共有 11 篇文章，请返回可用页码。")).toBeVisible();
    await expect(page.getByRole("link", { name: "返回第 1 页" })).toHaveAttribute("href", "/search?q=matrix-eleven");
    await expect(page.getByTestId("post-card")).toHaveCount(0);

    for (const query of ["http-400", "http-500", "http-503", "refusal", "malformed-json", "malformed-dto", "contradictory-totals"]) {
      await page.goto(`${expectedOrigin}/search?q=${query}`);
      await expect(page.getByRole("heading", { name: "暂时无法完成搜索" })).toBeVisible();
      await expect(page.getByText("搜索服务似乎暂时不可用，请重试或返回最新文章。")).toBeVisible();
      await expect(page.getByRole("link", { name: "重试" })).toBeVisible();
      await expect(page.getByTestId("post-card")).toHaveCount(0);
      await expectNoDiscoveryDisclosure(page);
    }
  });

  test("D-07: UI[long-text] proves EDGE[SRCH-01/encoding] EDGE[SRCH-02/boundary] EDGE[SRCH-02/encoding] with escaped hostile Unicode and fail-closed bounds", async ({ page }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    const invalidQueries = [
      "q=x&page=01",
      "q=x&page=0",
      "q=x&page=101",
      "q=x&page=1.5",
      "q=x&page=%2B1",
      "q=x&q=y",
      "q=x&unknown=y",
      `q=${"a".repeat(257)}`,
      `q=${encodeURIComponent("界".repeat(81))}`,
    ];
    for (const query of invalidQueries) {
      await page.goto(`${expectedOrigin}/search?${query}`);
      await expect(page.getByRole("heading", { name: "搜索条件无效" })).toBeVisible();
      await expect(page.getByTestId("post-card")).toHaveCount(0);
    }
    const statsAfterInvalid = await fixtureControl(page, "stats");
    expect(Object.keys(statsAfterInvalid.search)).toHaveLength(0);

    await page.goto(`${expectedOrigin}/search?q=${encodeURIComponent("hostile %ZZ + & 中文 e\u0301 😀")}`);
    const card = page.getByTestId("post-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByText('<script>alert("escaped")</script>', { exact: true })).toBeVisible();
    await expect(card.locator("script, img")).toHaveCount(0);
    await expect(card.getByText("暂无摘要")).toBeVisible();
    await expect(card.getByRole("link", { name: /分类：/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectNoDiscoveryDisclosure(page);

    await page.goto(`${expectedOrigin}/search?q=${encodeURIComponent("界".repeat(80))}&page=100`);
    await expect(page.getByRole("heading", { name: "没有找到匹配文章" })).toBeVisible();
    const stats = await fixtureControl(page, "stats");
    expect(stats.search["界".repeat(80)]).toBeGreaterThan(0);
  });

  test("D-06 D-07 D-16: EDGE[SRCH-01/concurrency] EDGE[SRCH-02/concurrency] keeps repeat body/head deterministic, canonical honest and every observation same-origin", async ({ page, context }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    const pages = [page, await context.newPage(), await context.newPage()];
    const requests: string[] = [];
    for (const item of pages) item.on("request", (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    await Promise.all(pages.map((item) => item.goto(`${expectedOrigin}/search?q=matrix-eleven&page=2`)));
    for (const item of pages) {
      await expect(item.getByTestId("post-card").locator("h3")).toHaveText(["矩阵结果 11"]);
      await expectSearchHead(item, `${expectedOrigin}/search?q=matrix-eleven&page=2`);
      await expectNoDiscoveryDisclosure(item);
    }
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => new URL(request).origin === expectedOrigin)).toBe(true);
    const searchSmoke = await page.request.get(`${expectedOrigin}/api/public/search?q=matrix-one&page=1`);
    expect(searchSmoke.status()).toBe(200);
    expect(new URL(searchSmoke.url()).origin).toBe(expectedOrigin);
    const relatedSmoke = await page.request.get(`${expectedOrigin}/api/public/articles/related-one/related`);
    expect(relatedSmoke.status()).toBe(200);
    expect(new URL(relatedSmoke.url()).origin).toBe(expectedOrigin);
  });

  test("D-11 D-12 D-13 D-14 D-15: UI[error] UI[overflow] proves EDGE[READ-08/adjacency] EDGE[READ-08/empty] EDGE[READ-08/ordering] and EDGE[READ-09/adjacency] EDGE[READ-09/empty] EDGE[READ-09/ordering] EDGE[READ-09/idempotency] EDGE[READ-09/concurrency]", async ({ page, context }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    await page.goto(`${expectedOrigin}/posts/related-one`);
    await expect(page.getByTestId("related-reading").getByTestId("post-card")).toHaveCount(1);
    await expect(page.getByTestId("related-reading")).not.toContainText("主文章 related-one");

    await page.goto(`${expectedOrigin}/posts/related-populated`);
    await expect(page.getByTestId("related-reading").getByTestId("post-card").locator("h3")).toHaveText(
      [1, 2, 3, 4].map((position) => `相关阅读 ${position}：保持 API 顺序`),
    );
    await expect(page.getByTestId("related-reading")).not.toContainText(/score|rank|shared|markdown|sourceId/i);

    await page.goto(`${expectedOrigin}/posts/related-zero`);
    await expect(page.getByTestId("related-reading")).toHaveCount(0);
    await expect(page.getByTestId("related-recovery")).toHaveCount(0);

    for (const slug of ["related-failure", "related-malformed", "related-refusal"]) {
      await page.goto(`${expectedOrigin}/posts/${slug}`);
      await expect(page.getByTestId("article-body")).toContainText("完整正文内容仍然可读。");
      await expect(page.getByTestId("related-recovery").getByRole("heading", { name: "相关文章暂时不可用" })).toBeVisible();
      await expect(page.getByText("没有找到这个页面")).toHaveCount(0);
    }

    await page.goto(`${expectedOrigin}/posts/related-lifecycle`);
    await expect(page.getByTestId("related-reading").getByTestId("post-card")).toHaveCount(1);
    await page.goto(`${expectedOrigin}/posts/related-lifecycle`);
    await expect(page.getByTestId("related-reading")).toHaveCount(0);
    await expect(page.getByTestId("related-recovery")).toHaveCount(0);

    const concurrentPages = [await context.newPage(), await context.newPage()];
    await Promise.all(concurrentPages.map((item) => item.goto(`${expectedOrigin}/posts/related-concurrent`)));
    for (const item of concurrentPages) {
      await expect(item.getByTestId("article-body")).toContainText("完整正文内容仍然可读。");
      await expect(item.getByTestId("related-reading").getByTestId("post-card").locator("h3")).toHaveText([
        "相关阅读 1：保持 API 顺序",
        "相关阅读 2：保持 API 顺序",
      ]);
    }

    for (const viewport of [{ width: 375, columns: 1 }, { width: 768, columns: 2 }, { width: 1280, columns: 2 }]) {
      await page.setViewportSize({ width: viewport.width, height: 900 });
      await page.goto(`${expectedOrigin}/posts/related-populated`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const columns = await page.getByTestId("related-reading").locator(":scope > div").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
      expect(columns).toBe(viewport.columns);
    }
    await expectNoDiscoveryDisclosure(page);
  });

  test("D-07: search metadata, Sitemap and RSS keep the exact noindex canonical matrix and unchanged public distribution", async ({ page }) => {
    const expectedOrigin = requireGeneratedOrigin(webOrigin, "E2E_WEB_ORIGIN");
    const cases: Array<[string, string | undefined]> = [
      ["/search", undefined],
      ["/search?q=matrix-one", `${expectedOrigin}/search?q=matrix-one`],
      ["/search?q=matrix-one&page=1", `${expectedOrigin}/search?q=matrix-one`],
      ["/search?q=matrix-eleven&page=2", `${expectedOrigin}/search?q=matrix-eleven&page=2`],
      ["/search?q=hidden-only", `${expectedOrigin}/search?q=hidden-only`],
      ["/search?q=matrix-eleven&page=3", undefined],
      ["/search?q=http-503", undefined],
      ["/search?q=x&q=y", undefined],
      ["/search?q=x&unknown=y", undefined],
    ];
    for (const [path, canonical] of cases) {
      await page.goto(`${expectedOrigin}${path}`);
      await expectSearchHead(page, canonical);
    }

    const sitemap = await page.request.get(`${expectedOrigin}/sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    const sitemapText = await sitemap.text();
    expect(sitemapText).toContain(`${expectedOrigin}/posts/trusted-search-result`);
    expect(sitemapText).not.toContain(`${expectedOrigin}/search`);
    const rss = await page.request.get(`${expectedOrigin}/rss.xml`);
    expect(rss.status()).toBe(200);
    const rssText = await rss.text();
    expect(rssText).toContain(`${expectedOrigin}/posts/trusted-search-result`);
    expect(rssText).not.toContain(`${expectedOrigin}/search`);
    await expectNoDiscoveryDisclosure(page);
  });
});
