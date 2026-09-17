import { expect, test, type Page } from "@playwright/test";

function requiredRunnerFact(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required from the generated main-browser fixture`);
  return value;
}

const username = requiredRunnerFact("E2E_ADMIN_USERNAME");
const password = requiredRunnerFact("E2E_ADMIN_PASSWORD");
const runId = requiredRunnerFact("E2E_RUN_ID");
const webOrigin = requiredRunnerFact("E2E_WEB_ORIGIN");
const expiredSessionToken = requiredRunnerFact("E2E_EXPIRED_SESSION_TOKEN");
const revokedSessionToken = requiredRunnerFact("E2E_REVOKED_SESSION_TOKEN");

async function login(page: Page, submittedPassword: string) {
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(submittedPassword);
  const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/auth/login"));
  await page.getByRole("button", { name: "登录" }).click();
  return response;
}

async function changePassword(page: Page, currentPassword: string, newPassword: string) {
  await page.getByLabel("当前密码").fill(currentPassword);
  await page.getByLabel("新密码", { exact: true }).fill(newPassword);
  await page.getByLabel("确认新密码").fill(newPassword);
  const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/auth/password"));
  await page.getByRole("button", { name: "修改密码" }).click();
  return response;
}

test("login, refresh, expiry, logout, and revoked-token reuse stay server-authorized", async ({ page, context }) => {
  await page.goto(`${webOrigin}/admin`);
  await expect(page).toHaveURL(`${webOrigin}/login`);

  const wrongResponse = await login(page, `${password}-wrong`);
  expect(wrongResponse.status()).toBe(401);
  await expect(page.locator('#login-error[role="alert"]')).toHaveText("用户名或密码错误。");

  const validResponse = await login(page, password);
  expect(validResponse.status()).toBe(200);
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  await expect(page.getByRole("heading", { name: "文章管理" })).toBeVisible();

  const storageKeys = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  expect(storageKeys).toEqual({ local: ["blog-x-theme"], session: [] });
  await page.reload();
  await expect(page.getByRole("heading", { name: "文章管理" })).toBeVisible();

  const activeCookie = (await context.cookies(webOrigin)).find((cookie) => cookie.name === "blog_x_session");
  expect(activeCookie?.httpOnly).toBe(true);
  await context.clearCookies();
  await context.addCookies([{ name: "blog_x_session", value: expiredSessionToken, url: webOrigin, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`${webOrigin}/admin`);
  await expect(page).toHaveURL(`${webOrigin}/login`);

  await context.clearCookies();
  expect(activeCookie).toBeTruthy();
  await context.addCookies([activeCookie!]);
  await page.goto(`${webOrigin}/admin`);
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  const revocableCookie = (await context.cookies(webOrigin)).find((cookie) => cookie.name === "blog_x_session");
  expect(revocableCookie).toBeTruthy();
  await page.evaluate(() => {
    sessionStorage.setItem("blog-x:editor-recovery:v1:new", "recovery-content");
    sessionStorage.setItem("unrelated-session-key", "preserved");
  });
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/login`);
  const logoutStorage = await page.evaluate(() => ({
    recovery: sessionStorage.getItem("blog-x:editor-recovery:v1:new"),
    unrelated: sessionStorage.getItem("unrelated-session-key"),
  }));
  expect(logoutStorage).toEqual({ recovery: null, unrelated: "preserved" });

  const denied = await context.request.post(`${webOrigin}/api/articles/publish`, {
    headers: { origin: webOrigin },
    data: { title: `Denied ${runId}`, slug: `denied-${runId}`, markdown: "# Denied" },
  });
  expect(denied.status()).toBe(401);

  await context.addCookies([{ name: "blog_x_session", value: revokedSessionToken, url: webOrigin, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`${webOrigin}/admin`);
  await expect(page).toHaveURL(`${webOrigin}/login`);
});

test("password change requires a fresh sign-in and restores the generated fixture credential", async ({ page, context }) => {
  const replacementPassword = `temporary-password-${runId}-change`;
  let passwordChanged = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${webOrigin}/admin`);
  await expect(page).toHaveURL(`${webOrigin}/login`);
  expect((await login(page, password)).status()).toBe(200);
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  try {
    await page.getByRole("button", { name: "打开后台导航" }).click();
    await page.getByRole("link", { name: "账户安全" }).click();
    await expect(page).toHaveURL(`${webOrigin}/admin/security`);
    await expect(page.getByRole("heading", { name: "账户安全" })).toBeVisible();
    await expect(page.getByLabel("当前密码")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.getByLabel("新密码", { exact: true })).toHaveAttribute("autocomplete", "new-password");
    const dimensions = await page.locator("form input, form button").evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    expect(dimensions.every((box) => box.height >= 44 || box.width >= 44)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const invalidResponse = await changePassword(page, `${password}-wrong`, replacementPassword);
    expect(invalidResponse.status()).toBe(400);
    await expect(page.getByRole("alert")).toContainText("当前密码错误");
    expect(await page.evaluate(() => fetch("/api/auth/session").then((response) => response.status))).toBe(200);

    const changedResponse = await changePassword(page, password, replacementPassword);
    passwordChanged = changedResponse.status() === 200;
    expect(changedResponse.status()).toBe(200);
    await expect(page).toHaveURL(`${webOrigin}/login`);
    expect((await login(page, password)).status()).toBe(401);
    await expect(page.getByRole("alert")).toContainText("用户名或密码错误。");
    expect((await login(page, replacementPassword)).status()).toBe(200);
    await expect(page).toHaveURL(`${webOrigin}/admin`);
    await page.goto(`${webOrigin}/admin/audit`);
    await expect(page.getByText("管理员修改密码")).toBeVisible();
    await expect(page.getByText("变更：密码")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(replacementPassword);
  } finally {
    if (passwordChanged) {
      await context.clearCookies();
      await page.goto(`${webOrigin}/login`);
      expect((await login(page, replacementPassword)).status()).toBe(200);
      await expect(page).toHaveURL(`${webOrigin}/admin`);
      await page.goto(`${webOrigin}/admin/security`);
      const restoredResponse = await changePassword(page, replacementPassword, password);
      expect(restoredResponse.status()).toBe(200);
      await expect(page).toHaveURL(`${webOrigin}/login`);
      expect((await login(page, password)).status()).toBe(200);
      await expect(page).toHaveURL(`${webOrigin}/admin`);
    }
  }
});
