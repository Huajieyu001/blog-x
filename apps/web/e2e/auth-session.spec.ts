import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { expireSessionToken } from "../../api/test/session-fixture";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;
const webOrigin = "http://127.0.0.1:3100";
const processes: ChildProcess[] = [];

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* process is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function login(page: Page, submittedPassword: string) {
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(submittedPassword);
  const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/auth/login"));
  await page.getByRole("button", { name: "登录" }).click();
  return response;
}

test.beforeAll(async () => {
  const api = spawn(process.execPath, ["--import", "tsx", "apps/api/src/app.ts"], { stdio: "ignore", env: process.env });
  processes.push(api); await waitFor("http://127.0.0.1:3001/health");
  const web = spawn(process.execPath, ["apps/web/node_modules/next/dist/bin/next", "dev", "apps/web", "-p", "3100"], { stdio: "ignore", env: process.env });
  processes.push(web); await waitFor(webOrigin);
});

test.afterAll(() => { for (const process of processes) process.kill("SIGTERM"); });

test("login, refresh, expiry, logout, and revoked-token reuse stay server-authorized", async ({ page, context }) => {
  test.skip(!username || !password || !databaseUrl, "E2E administrator credentials and database are required");

  await page.goto(`${webOrigin}/admin`);
  await expect(page).toHaveURL(`${webOrigin}/login`);

  const wrongResponse = await login(page, `${password}-wrong`);
  expect(wrongResponse.status()).toBe(401);
  await expect(page.getByText("用户名或密码错误", { exact: true })).toBeVisible();

  const validResponse = await login(page, password!);
  expect(validResponse.status()).toBe(200);
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  await expect(page.getByRole("heading", { name: "文章管理" })).toBeVisible();

  const storageKeys = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  expect(storageKeys).toEqual({ local: [], session: [] });
  await page.reload();
  await expect(page.getByRole("heading", { name: "文章管理" })).toBeVisible();

  const activeCookie = (await context.cookies(webOrigin)).find((cookie) => cookie.name === "blog_x_session");
  expect(activeCookie?.httpOnly).toBe(true);
  await expireSessionToken(databaseUrl!, activeCookie!.value);
  await page.reload();
  await expect(page).toHaveURL(`${webOrigin}/login`);

  await login(page, password!);
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  const revocableCookie = (await context.cookies(webOrigin)).find((cookie) => cookie.name === "blog_x_session");
  expect(revocableCookie).toBeTruthy();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/login`);

  const denied = await context.request.post(`${webOrigin}/api/articles/publish`, {
    headers: { origin: webOrigin },
    data: { title: "Denied", slug: `denied-${Date.now()}`, markdown: "# Denied" },
  });
  expect(denied.status()).toBe(401);

  await context.addCookies([{ ...revocableCookie!, domain: "127.0.0.1" }]);
  await page.goto(`${webOrigin}/admin`);
  await expect(page).toHaveURL(`${webOrigin}/login`);
});
