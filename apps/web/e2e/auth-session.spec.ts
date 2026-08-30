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

test("login, refresh, expiry, logout, and revoked-token reuse stay server-authorized", async ({ page, context }) => {
  await page.goto(`${webOrigin}/admin`);
  await expect(page).toHaveURL(`${webOrigin}/login`);

  const wrongResponse = await login(page, `${password}-wrong`);
  expect(wrongResponse.status()).toBe(401);
  await expect(page.getByText("用户名或密码错误", { exact: true })).toBeVisible();

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
