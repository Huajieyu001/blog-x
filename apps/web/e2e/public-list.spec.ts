import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;
const webOrigin = "http://127.0.0.1:3100";
const processes: ChildProcess[] = [];

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* process is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test.beforeAll(async () => {
  if (!databaseUrl) return;
  const api = spawn(process.execPath, ["--import", "tsx", "apps/api/src/app.ts"], { stdio: "ignore", env: process.env });
  processes.push(api); await waitFor("http://127.0.0.1:3001/health");
  const web = spawn(process.execPath, ["apps/web/node_modules/next/dist/bin/next", "dev", "apps/web", "-p", "3100"], { stdio: "ignore", env: process.env });
  processes.push(web); await waitFor(webOrigin);
});

test.afterAll(async () => {
  for (const process of processes) process.kill("SIGTERM");
});

test("public SSR home exposes editorial cards, stable pagination, and fresh lifecycle visibility", async ({ page, request }) => {
  test.setTimeout(90_000);
  test.skip(!username || !password || !databaseUrl, "E2E database and administrator credentials are required");
  const browserApiRequests: string[] = [];
  page.on("request", (requestEvent) => {
    if (requestEvent.url().includes("/api/public/articles")) browserApiRequests.push(requestEvent.url());
  });

  const apiFirst = await request.get(`${webOrigin}/api/public/articles?page=1`);
  expect(apiFirst.status()).toBe(200);
  expect((await apiFirst.json()).totalItems).toBe(12);

  await page.goto(webOrigin);
  await expect(page.getByRole("heading", { name: "Blog X" })).toBeVisible();
  await expect(page.getByTestId("post-card")).toHaveCount(10);
  const firstCard = page.getByTestId("post-card").first();
  await expect(firstCard.getByRole("link", { name: "Editorial 11", exact: true })).toHaveAttribute("href", "/posts/editorial-11");
  await expect(firstCard).toContainText("A concise summary for article 11.");
  await expect(firstCard).toContainText("已发布");
  await expect(firstCard.locator("time")).toHaveAttribute("datetime", "2026-08-01T12:00:00.000Z");
  await expect(page.getByText("Private draft")).toHaveCount(0);
  await expect(page.getByText("Downline post")).toHaveCount(0);
  await expect(page.getByText("Deleted post")).toHaveCount(0);
  const pagination = page.getByRole("navigation", { name: "文章分页" });
  await expect(pagination.getByRole("link", { name: "第 1 页" })).toHaveAttribute("aria-current", "page");
  await expect(pagination.getByText("上一页")).toHaveAttribute("aria-disabled", "true");
  await expect(pagination.getByRole("link", { name: "下一页" })).toHaveAttribute("href", "/?page=2");
  await pagination.getByRole("link", { name: "下一页" }).focus();
  await expect(pagination.getByRole("link", { name: "下一页" })).toBeFocused();
  expect(browserApiRequests).toEqual([]);

  await page.goto(`${webOrigin}/?page=2`);
  await expect(page.getByTestId("post-card")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "文章分页" }).getByRole("link", { name: "第 2 页" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "文章分页" }).getByRole("link", { name: "上一页" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("navigation", { name: "文章分页" }).getByText("下一页")).toHaveAttribute("aria-disabled", "true");

  await page.goto(`${webOrigin}/?page=99`);
  await expect(page.getByText("这一页还没有文章")).toBeVisible();
  await expect(page.getByTestId("post-card")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "返回最新文章" })).toHaveAttribute("href", "/");

  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  await page.goto(`${webOrigin}/admin/new`);
  const slug = `fresh-public-${Date.now()}`;
  const title = "Fresh lifecycle publication";
  await page.getByLabel("标题").fill(title);
  await page.getByLabel("摘要").fill("Appears only while publication is current.");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Markdown").fill("# Fresh publication");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]+$/);
  const editorUrl = page.url();
  await page.getByRole("button", { name: "发布" }).click();
  await page.goto(webOrigin);
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();

  await page.goto(editorUrl);
  await page.getByRole("button", { name: "下线" }).click();
  await page.goto(webOrigin);
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);

  await page.goto(editorUrl);
  await page.getByRole("button", { name: "重新发布" }).click();
  await page.goto(webOrigin);
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();

  await page.goto(editorUrl);
  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("dialog", { name: "确认软删除文章" }).getByRole("button", { name: "确认软删除" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  await page.goto(webOrigin);
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
});
