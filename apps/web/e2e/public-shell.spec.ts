import { expect, test } from "@playwright/test";

const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";
const primaryLabels = ["文章", "分类", "标签", "归档", "关于", "订阅"];

test("shared public shell preserves ordered navigation, theme preference, and responsive keyboard access", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${webOrigin}/`);

  const header = page.getByTestId("public-header");
  const nav = page.getByTestId("public-nav");
  await expect(header).toBeVisible();
  await expect(nav.getByRole("link")).toHaveText([...primaryLabels, "管理"]);
  const subscription = nav.getByRole("link", { name: "订阅", exact: true });
  await expect(subscription).toBeVisible();
  await expect(subscription).toHaveAttribute("href", "/rss.xml");
  await expect(nav.getByRole("link", { name: "文章", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("mobile-menu-toggle")).toBeHidden();

  const theme = page.getByTestId("theme-toggle");
  await theme.getByLabel("深色").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("blog-x-theme"))).toBe("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(theme.getByLabel("深色")).toBeChecked();

  await page.evaluate(() => localStorage.setItem("blog-x-theme", "<svg onload=alert(1)>") );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /^(?:light|dark)$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("blog-x-theme"))).toBe("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.setViewportSize({ width: 375, height: 812 });
  const toggle = page.getByTestId("mobile-menu-toggle");
  await expect(toggle).toHaveAccessibleName("打开站点导航");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAccessibleName("关闭站点导航");
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "分类", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "订阅", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();

  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/categories", "/tags", "/archives"]) {
      await page.goto(`${webOrigin}${path}`);
      await expect(page.getByTestId("public-header")).toBeVisible();
      const currentLabel = path === "/" ? "文章" : path === "/categories" ? "分类" : path === "/tags" ? "标签" : "归档";
      await expect(page.getByTestId("public-nav").getByRole("link", { name: currentLabel, exact: true, includeHidden: true })).toHaveAttribute("aria-current", "page");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    if (viewport.width < 1024) await page.getByTestId("mobile-menu-toggle").click();
    for (const label of [...primaryLabels, "管理"]) await expect(page.getByTestId("public-nav").getByRole("link", { name: label, exact: true })).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toBeVisible();

    await page.goto(`${webOrigin}/`);
    await page.locator("#site-title").evaluate((element) => {
      element.textContent = "跨设备阅读 ResponsiveReading 响应式内容验证 ".repeat(4);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await testInfo.attach(`public-shell-${viewport.width}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }

  const noScript = await browser.newContext({ javaScriptEnabled: false, colorScheme: "dark", viewport: { width: 375, height: 812 } });
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(`${webOrigin}/`);
  const colors = await noScriptPage.evaluate(() => {
    const style = getComputedStyle(document.querySelector("main")!);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).not.toBe(colors.color);
  await expect(noScriptPage.getByRole("link", { name: "文章", exact: true })).toBeVisible();
  const noScriptSubscription = noScriptPage.getByRole("link", { name: "订阅", exact: true });
  await expect(noScriptSubscription).toBeVisible();
  await expect(noScriptSubscription).toHaveAttribute("href", "/rss.xml");
  await noScript.close();

  const storageBlocked = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await storageBlocked.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("storage blocked"); };
    Storage.prototype.setItem = () => { throw new Error("storage blocked"); };
  });
  const blockedPage = await storageBlocked.newPage();
  await blockedPage.goto(`${webOrigin}/`);
  await expect(blockedPage.locator("html")).toHaveAttribute("data-theme", /^(?:light|dark)$/);
  await expect(blockedPage.getByRole("heading", { name: "Blog X", exact: true })).toBeVisible();
  await storageBlocked.close();

  await page.goto(`${webOrigin}/login`);
  await expect(page.getByTestId("public-header")).toHaveCount(0);
});
