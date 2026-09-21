import { expect, test, type Page } from "@playwright/test";

function requiredRunnerFact(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required from the generated main-browser fixture`);
  return value;
}

const username = requiredRunnerFact("E2E_ADMIN_USERNAME");
const password = requiredRunnerFact("E2E_ADMIN_PASSWORD");
const webOrigin = requiredRunnerFact("E2E_WEB_ORIGIN");
const analyticsTitle = requiredRunnerFact("E2E_ANALYTICS_TITLE");
const failureWebOrigin = requiredRunnerFact("E2E_FAILURE_WEB_ORIGIN");
const failureFixtureOrigin = requiredRunnerFact("E2E_FAILURE_FIXTURE_ORIGIN");
const expiredSessionToken = requiredRunnerFact("E2E_EXPIRED_SESSION_TOKEN");

async function login(page: Page) {
  await page.goto(`${webOrigin}/admin`);
  if (page.url().endsWith("/login")) {
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录" }).click();
  }
  await expect(page).toHaveURL(`${webOrigin}/admin`);
}

test("administrator analytics uses same-origin SSR navigation with strict ranges and permanent privacy copy", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "查看完整统计 →" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin/analytics?range=30`);
  await expect(page.getByRole("heading", { name: "访问统计" })).toBeVisible();
  await expect(page.getByText("这里展示的是按 Asia/Shanghai 自然日汇总的匿名页面浏览量（PV）。")).toBeVisible();
  await expect(page.getByRole("figure", { name: "每日趋势" }).getByText("10 PV", { exact: true })).toBeVisible();
  await expect(page.getByText("直接访问")).toBeVisible();
  await expect(page.getByText("7 PV · 70.0%", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: analyticsTitle })).toBeVisible();
  await expect(page.getByText("所选时段还没有浏览记录")).toHaveCount(0);
  const csvDownload = page.getByRole("link", { name: "下载每日 CSV" });
  await expect(csvDownload).toHaveAttribute("href", "/api/admin/analytics.csv?range=30&limit=8");
  const overview = page.getByRole("group", { name: "访问概览" });
  await expect(overview.getByText("日均 PV", { exact: true })).toBeVisible();
  await expect(overview.getByText("有访问的天数", { exact: true })).toBeVisible();
  await expect(overview.getByText("最高单日", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "30 天" })).toHaveAttribute("aria-current", "page");
  for (const range of ["7 天", "90 天", "400 天"]) await expect(page.getByRole("link", { name: range })).toBeVisible();
  await page.getByRole("link", { name: "7 天" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin/analytics?range=7`);
  await expect(page.getByRole("heading", { name: "所选时段还没有浏览记录" })).toBeVisible();
  await expect(page.getByRole("link", { name: "下载每日 CSV" })).toHaveAttribute("href", "/api/admin/analytics.csv?range=7&limit=8");
});

test("invalid analytics range never reaches an analytics API request and offers exact recovery", async ({ page }) => {
  await login(page);
  let analyticsRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/admin/analytics")) analyticsRequests += 1; });
  await page.goto(`${webOrigin}/admin/analytics?range=30&range=7`);
  await expect(page.getByRole("heading", { name: "时间范围无效" })).toBeVisible();
  await expect(page.getByText("请选择 7、30、90 或 400 天。", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "查看 30 天" })).toHaveAttribute("href", "/admin/analytics?range=30");
  expect(analyticsRequests).toBe(0);
  await expect(page.getByRole("link", { name: "下载每日 CSV" })).toHaveCount(0);
});

test("dashboard keeps its authoring hierarchy and visible static actions", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  for (const heading of ["内容概况", "继续创作", "最近 30 天访问", "文章管理", "站点维护"]) await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByRole("link", { name: "新建草稿" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "导出文章 Markdown" })).toBeVisible();
  const publishedOverview = page.getByRole("link", { name: /已发布.*查看文章/ });
  await expect(publishedOverview).toHaveAttribute("href", "/admin?status=published#articles");
  await publishedOverview.click();
  await expect(page).toHaveURL(`${webOrigin}/admin?status=published#articles`);
  await expect(page.getByRole("button", { name: /已发布/ })).toHaveAttribute("aria-pressed", "true");
  await page.goto(`${webOrigin}/admin?status=published&status=draft#articles`);
  await expect(page.getByRole("button", { name: /全部/ })).toHaveAttribute("aria-pressed", "true");
  const articleSort = page.getByLabel("文章排序");
  await articleSort.selectOption("title");
  await expect(page).toHaveURL(`${webOrigin}/admin?sort=title#articles`);
  await expect(articleSort).toHaveValue("title");
  await page.reload();
  await expect(page.getByLabel("文章排序")).toHaveValue("title");
  await expect(page.getByRole("link", { name: /已发布.*查看文章/ })).toHaveAttribute("href", "/admin?status=published&sort=title#articles");
  await page.goto(`${webOrigin}/admin?sort=oldest&sort=title#articles`);
  await expect(page.getByLabel("文章排序")).toHaveValue("recent");

  const articleSearch = page.getByLabel("搜索文章");
  const normalizedQuery = analyticsTitle.normalize("NFC");
  const encodedQuery = new URLSearchParams({ q: normalizedQuery }).toString().slice(2);
  await page.goto(`${webOrigin}/admin?q=%20${encodeURIComponent(normalizedQuery)}%20&status=published&sort=title#articles`);
  await expect(articleSearch).toHaveValue(normalizedQuery);
  await expect(page.getByRole("button", { name: /已发布/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("文章排序")).toHaveValue("title");
  await expect(page.getByTestId(/admin-post-/).filter({ hasText: normalizedQuery })).toHaveCount(1);
  await page.goto(`${webOrigin}/admin?q=one&q=two#articles`);
  await expect(articleSearch).toHaveValue("");
  await page.goto(`${webOrigin}/admin?q=${"x".repeat(200)}#articles`);
  await expect(articleSearch).toHaveValue("x".repeat(160));

  await page.goto(`${webOrigin}/admin?status=published&sort=title#articles`);
  await articleSearch.pressSequentially(normalizedQuery);
  expect(page.url()).toBe(`${webOrigin}/admin?status=published&sort=title#articles`);
  await expect.poll(() => page.url()).toBe(`${webOrigin}/admin?q=${encodedQuery}&status=published&sort=title#articles`);
  await expect(page.getByTestId(/admin-post-/).filter({ hasText: normalizedQuery })).toHaveCount(1);
  await page.getByRole("button", { name: /草稿/ }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin?q=${encodedQuery}&status=draft&sort=title#articles`);
  await page.getByRole("button", { name: /已发布/ }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin?q=${encodedQuery}&status=published&sort=title#articles`);
  await expect(page.getByRole("link", { name: /已发布.*查看文章/ })).toHaveAttribute("href", `/admin?q=${encodedQuery}&status=published&sort=title#articles`);
  await page.reload();
  await expect(articleSearch).toHaveValue(normalizedQuery);
  await expect(page.getByRole("button", { name: /已发布/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("文章排序")).toHaveValue("title");
  await expect(page.getByTestId(/admin-post-/).filter({ hasText: normalizedQuery })).toHaveCount(1);
  await page.getByTestId(/admin-post-/).filter({ hasText: normalizedQuery }).getByRole("link", { name: "编辑文章" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\//);
  await page.goBack();
  await expect(page).toHaveURL(`${webOrigin}/admin?q=${encodedQuery}&status=published&sort=title#articles`);
  await expect(articleSearch).toHaveValue(normalizedQuery);

  const clearSearch = page.getByRole("button", { name: "清除文章搜索" });
  await expect(clearSearch).toBeVisible();
  const desktopClearBox = await clearSearch.boundingBox();
  expect(desktopClearBox?.height).toBeGreaterThanOrEqual(44);
  await clearSearch.click();
  await expect.poll(() => page.url()).toBe(`${webOrigin}/admin?status=published&sort=title#articles`);
  await expect(articleSearch).toHaveValue("");
  await expect(articleSearch).toBeFocused();

  await articleSearch.fill(normalizedQuery);
  await expect.poll(() => page.url()).toBe(`${webOrigin}/admin?q=${encodedQuery}&status=published&sort=title#articles`);
  expect(page.url().match(/#articles/g)).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowClearSearch = page.getByRole("button", { name: "清除文章搜索" });
  await expect(narrowClearSearch).toBeVisible();
  const narrowClearBox = await narrowClearSearch.boundingBox();
  expect(narrowClearBox?.height).toBeGreaterThanOrEqual(44);
  await narrowClearSearch.click();
  await expect(page).toHaveURL(`${webOrigin}/admin?status=published&sort=title#articles`);
  await expect(articleSearch).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("dashboard keeps content and analytics failures independent", async ({ page, request }) => {
  await expect((await request.post(`${failureFixtureOrigin}/control/analytics-failure`)).status()).toBe(204);
  await page.goto(`${failureWebOrigin}/admin`);
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "访问趋势暂时不可用" })).toBeVisible();
  await page.goto(`${failureWebOrigin}/admin/analytics?range=30`);
  await expect(page.getByRole("heading", { name: "暂时无法读取访问统计" })).toBeVisible();
  await expect(page.getByRole("link", { name: "下载每日 CSV" })).toHaveCount(0);

  await page.goto(`${failureWebOrigin}/admin`);
  await expect(page.getByRole("heading", { name: "内容概况暂时不可用" })).toHaveCount(0);
  await expect(page.getByText("还没有文章。新建第一篇草稿，开始记录。")).toBeVisible();

  await expect((await request.post(`${failureFixtureOrigin}/control/content-failure`)).status()).toBe(204);
  await page.goto(`${failureWebOrigin}/admin`);
  await expect(page.getByRole("heading", { name: "内容概况暂时不可用" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "暂时无法读取创作进度" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "暂时无法读取文章列表" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "访问趋势暂时不可用" })).toHaveCount(0);
  await expect(page.getByText("所选时段还没有浏览记录")).toBeVisible();
});

test("secondary administrator failures stay bounded, recoverable, and redacted", async ({ page, request }) => {
  await expect((await request.post(`${failureFixtureOrigin}/control/about-failure`)).status()).toBe(204);
  await page.goto(`${failureWebOrigin}/admin/about`);
  await expect(page.getByRole("heading", { name: "关于页", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "暂时无法读取关于页" })).toBeVisible();
  await expect(page.getByRole("link", { name: "重新加载关于页" })).toBeVisible();
  await expect(page.getByRole("button", { name: /保存|发布/ })).toHaveCount(0);

  await expect((await request.post(`${failureFixtureOrigin}/control/categories-failure`)).status()).toBe(204);
  await page.goto(`${failureWebOrigin}/admin/taxonomy`);
  await expect(page.getByRole("heading", { name: "分类暂时不可用" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "标签暂时不可用" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "重新加载分类" })).toBeVisible();

  await expect((await request.post(`${failureFixtureOrigin}/control/tags-failure`)).status()).toBe(204);
  await page.goto(`${failureWebOrigin}/admin/taxonomy`);
  await expect(page.getByRole("heading", { name: "标签暂时不可用" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "分类暂时不可用" })).toHaveCount(0);

  await expect((await request.post(`${failureFixtureOrigin}/control/audit-failure`)).status()).toBe(204);
  await page.goto(`${failureWebOrigin}/admin/audit`);
  await expect(page.getByRole("heading", { name: "操作日志", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "暂时无法读取操作日志" })).toBeVisible();
  await expect(page.getByText(/执行者 ID：|对象 ID：/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "重新加载操作日志" })).toBeVisible();
});

test("expired analytics session redirects to login without exposing statistics", async ({ page, context }) => {
  await context.addCookies([{ name: "blog_x_session", value: expiredSessionToken, url: webOrigin, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`${webOrigin}/admin/analytics?range=30`);
  await expect(page).toHaveURL(`${webOrigin}/login`);
  await expect(page.getByRole("heading", { name: "管理员登录" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "访问统计" })).toHaveCount(0);
  await expect(page.getByText("10 PV", { exact: true })).toHaveCount(0);
});

test("analytics remains keyboard-accessible, bounded, and document-width-safe across responsive viewports", async ({ page }) => {
  await login(page);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${webOrigin}/admin/analytics?range=400`);
    await expect(page.getByRole("link", { name: "400 天" })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  const range = page.getByRole("link", { name: "400 天" });
  await range.focus();
  await expect(range).toBeFocused();
  const targetSize = await range.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(targetSize.width).toBeGreaterThanOrEqual(44);
  expect(targetSize.height).toBeGreaterThanOrEqual(44);
  const scroller = page.getByLabel("每日 PV 趋势图，可横向滚动");
  await scroller.focus();
  await expect(scroller).toBeFocused();
});

test("site settings workspace remains responsive with its fixed ICP guidance", async ({ page }) => {
  await login(page);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${webOrigin}/admin/settings`);
    await expect(page.getByRole("heading", { name: "站点设置" })).toBeVisible();
    await expect(page.getByText("备案号固定保留为“黔ICP备2023015906号”，并始终链接至工信部备案查询页面。", { exact: true })).toBeVisible();
    const name = page.getByLabel("站点名称");
    const description = page.getByLabel("站点简介");
    const publicInfo = page.getByLabel("公开展示信息");
    await expect(name).toHaveAttribute("maxlength", "120");
    await expect(description).toHaveAttribute("maxlength", "320");
    await expect(publicInfo).toHaveAttribute("maxlength", "1000");
    await expect(page.getByText(`已输入 ${(await name.inputValue()).length}/120 个字符`, { exact: true })).toBeVisible();
    await expect(page.getByText(`已输入 ${(await description.inputValue()).length}/320 个字符`, { exact: true })).toBeVisible();
    await expect(page.getByText(`已输入 ${(await publicInfo.inputValue()).length}/1000 个字符`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "保存站点设置" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${webOrigin}/admin/settings`);
  const name = page.getByLabel("站点名称");
  const initialName = await name.inputValue();
  await name.fill(`${initialName} 更新`);
  await expect(page.getByText(`已输入 ${(initialName + " 更新").length}/120 个字符`, { exact: true })).toBeVisible();
  await expect(page.getByText("有未保存更改", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    return { dispatched: window.dispatchEvent(event), prevented: event.defaultPrevented };
  })).toEqual({ dispatched: false, prevented: true });

  await name.fill(initialName);
  await expect(page.getByText("有未保存更改", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    return { dispatched: window.dispatchEvent(event), prevented: event.defaultPrevented };
  })).toEqual({ dispatched: true, prevented: false });

  let settingsRequests = 0;
  page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/admin/site-settings") settingsRequests += 1; });
  await name.fill("   ");
  await page.getByRole("button", { name: "保存站点设置" }).click();
  await expect(page.getByText("站点名称不能为空。", { exact: true })).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toBeFocused();
  expect(settingsRequests).toBe(0);
});

test("administrator shell is private, responsive, compact, and theme-aware", async ({ page }) => {
  const origins = new Set<string>();
  page.on("request", (request) => origins.add(new URL(request.url()).origin));
  await login(page);
  await page.goto(`${webOrigin}/admin/analytics?range=30`);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(page.getByRole("heading", { name: "访问统计" })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main")).toBeVisible();
  expect([...origins]).toEqual([webOrigin]);

  await page.setViewportSize({ width: 1280, height: 900 });

  const navigation = page.getByRole("complementary", { name: "后台导航" });
  const destinations = [
    ["/admin", "工作台"],
    ["/admin#articles", "文章管理"],
    ["/admin/new", "新建文章"],
    ["/admin/analytics?range=30", "访问统计"],
    ["/admin/taxonomy", "分类与标签"],
    ["/admin/about", "关于页"],
    ["/admin/settings", "站点设置"],
    ["/admin/audit", "操作日志"],
  ] as const;

  for (const [path, currentLabel] of destinations) {
    await page.goto(`${webOrigin}${path}`);
    await expect(navigation.getByRole("link", { name: currentLabel })).toHaveAttribute("aria-current", "page");
    await expect.poll(async () => navigation.getByRole("link").evaluateAll((links) => links.filter((link) => link.getAttribute("aria-current") === "page").length)).toBe(1);
    if (path === "/admin/about") {
      const publicAbout = page.getByRole("link", { name: "查看公开关于页" });
      await publicAbout.focus();
      await expect(publicAbout).toBeFocused();
      expect(await publicAbout.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    }
  }
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();

  await page.goto(`${webOrigin}/admin/analytics?range=30`);
  const detailPath = await page.getByRole("link", { name: analyticsTitle }).getAttribute("href");
  expect(detailPath).toMatch(/^\/admin\/posts\//);
  await page.goto(`${webOrigin}${detailPath}`);
  await expect(navigation.getByRole("link", { name: "文章管理" })).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${webOrigin}/admin`);
  const menu = page.getByRole("button", { name: "打开后台导航" });
  const content = page.locator("#admin-content");
  await menu.click();
  await expect(navigation.getByRole("link", { name: "工作台" })).toBeFocused();
  await expect(content).toHaveAttribute("inert", "");
  await page.keyboard.press("Shift+Tab");
  expect(await navigation.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();

  await menu.click();
  await page.getByRole("link", { name: "文章管理" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin#articles`);
  await expect(content).toBeFocused();
  await expect(navigation.getByRole("link", { name: "文章管理" })).toHaveAttribute("aria-current", "page");

  await menu.click();
  await expect(page.getByRole("button", { name: "关闭后台导航" }).last()).toBeVisible();
  await page.mouse.click(370, 400);
  await expect(menu).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 900 });

  const row = page.getByTestId(/admin-post-/).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole("heading")).toBeVisible();
  await expect(row.getByText(/^更新于 /)).toBeVisible();
  await expect(row.getByRole("link", { name: "编辑文章" })).toBeVisible();
  await expect(row.getByRole("button", { name: "删除" })).toHaveCount(0);
  await row.getByText("管理操作", { exact: true }).click();
  await expect(row.getByRole("button", { name: "删除" })).toBeVisible();
  await row.getByRole("button", { name: "删除" }).click();
  const confirmation = page.getByRole("dialog", { name: "确认软删除文章" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "取消" }).click();
  await expect(confirmation).toHaveCount(0);

  const routes = [
    ["/admin/taxonomy", "分类与标签", "返回文章管理"],
    ["/admin/audit", "操作日志", "返回工作台"],
    ["/admin/analytics?range=30", "访问统计", "30 天"],
  ] as const;
  await page.setViewportSize({ width: 390, height: 900 });
  for (const [path, heading, controlName] of routes) {
    await page.goto(`${webOrigin}${path}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const control = page.getByRole("link", { name: controlName }).first();
    const target = await control.boundingBox();
    expect(target?.height).toBeGreaterThanOrEqual(44);
    expect(target?.width).toBeGreaterThanOrEqual(44);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  const theme = page.getByRole("radiogroup", { name: "切换主题" });
  await page.getByLabel("浅色", { exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("深色", { exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await theme.getByLabel("跟随系统", { exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
