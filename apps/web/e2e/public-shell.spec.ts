import { expect, test } from "@playwright/test";

const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";
const primaryLabels = ["文章", "分类", "标签", "归档", "关于", "订阅"];

function expectSecurityHeaders(headers: Record<string, string>) {
  const csp = headers["content-security-policy"];
  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  expect(csp).toContain("img-src 'self'");
  expect(csp).toContain("font-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("media-src 'self'");
  expect(csp).toContain("manifest-src 'self'");
  expect(csp).toContain("worker-src 'self' blob:");
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).not.toContain("*");
  expect(headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  expect(headers["x-powered-by"]).toBeUndefined();
}

test("fixed public ingress applies security headers without blocking theme, API, or media rewrites", async ({ page, request }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /content security policy/i.test(message.text())) cspErrors.push(message.text());
  });

  const home = await page.goto(`${webOrigin}/`, { waitUntil: "networkidle" });
  expect(home?.status()).toBe(200);
  expectSecurityHeaders(home!.headers());
  await page.getByTestId("theme-toggle").getByLabel("深色").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  for (const path of ["/login", "/admin", "/api/health", "/media/00000000-0000-4000-8000-000000000000"]) {
    const response = await request.get(`${webOrigin}${path}`, { maxRedirects: 0 });
    expect(response.status()).toBeLessThan(500);
    expectSecurityHeaders(response.headers());
  }
  expect(cspErrors).toEqual([]);
});

test("public shell does not fan out navigation prefetches", async ({ page }) => {
  const prefetches: string[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-router-prefetch"] === "1") prefetches.push(new URL(request.url()).pathname);
  });

  const response = await page.goto(`${webOrigin}/`, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("public-header")).toBeVisible();
  expect(prefetches).toEqual([]);
});

test("public and login routes expose a visible first-focus skip path without responsive overflow", async ({ page }) => {
  for (const [viewport, theme] of [
    [{ width: 1280, height: 900 }, "light"],
    [{ width: 375, height: 812 }, "dark"],
  ] as const) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/login"]) {
      await page.goto(`${webOrigin}${path}`);
      const skipLink = page.getByRole("link", { name: "跳到正文" });
      const content = page.locator("#main-content");
      await page.evaluate((nextTheme) => { document.documentElement.dataset.theme = nextTheme; }, theme);
      const dimensionsBefore = await content.evaluate((element) => ({ width: element.offsetWidth, height: element.offsetHeight }));
      const noOverflowBefore = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      expect(await skipLink.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.bottom <= 0 || box.right <= 0 || box.left >= window.innerWidth || box.top >= window.innerHeight;
      })).toBe(true);

      await page.keyboard.press("Tab");
      await expect(skipLink).toBeFocused();
      expect(await skipLink.evaluate((element) => element.getBoundingClientRect().top >= 0)).toBe(true);
      await page.keyboard.press("Enter");
      await expect(content).toBeFocused();
      const focusState = await content.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          active: document.activeElement === element,
          visibleOutline: style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0,
          visibleInsetShadow: style.boxShadow !== "none" && /\binset\b/.test(style.boxShadow),
        };
      });
      expect(focusState.active).toBe(true);
      expect(focusState.visibleOutline || focusState.visibleInsetShadow).toBe(true);
      expect(await content.evaluate((element) => ({ width: element.offsetWidth, height: element.offsetHeight }))).toEqual(dimensionsBefore);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(noOverflowBefore);
      expect(noOverflowBefore).toBe(true);
    }
  }
});

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
