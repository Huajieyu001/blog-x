import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
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
  const api = spawn(process.execPath, ["--import", "tsx", "apps/api/src/app.ts"], { stdio: "ignore", env: process.env });
  processes.push(api); await waitFor("http://127.0.0.1:3001/health");
  const web = spawn(process.execPath, ["apps/web/node_modules/next/dist/bin/next", "dev", "apps/web", "-p", "3100"], { stdio: "ignore", env: process.env });
  processes.push(web); await waitFor(webOrigin);
});

test.afterAll(() => { for (const process of processes) process.kill("SIGTERM"); });

test("draft completes publish, edit, slug confirmation, unpublish, republish, and soft-delete through visible controls", async ({ page, request }) => {
  test.skip(!username || !password, "E2E administrator credentials are required");
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  await page.goto(`${webOrigin}/admin/new`);
  const originalSlug = `browser-lifecycle-${Date.now()}`;
  await page.getByLabel("标题").fill("Browser lifecycle article");
  await page.getByLabel("摘要").fill("Lifecycle browser summary");
  await page.getByLabel("Slug").fill(originalSlug);
  await page.getByLabel("Markdown").fill("# Browser lifecycle\n\nOriginal content");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]+$/);
  await expect(page.getByRole("button", { name: "发布" })).toBeVisible();
  await expect(page.getByRole("button", { name: "下线" })).toHaveCount(0);

  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
  const firstPublishedAt = await page.getByLabel("发布时间").inputValue();
  expect(firstPublishedAt).not.toBe("");
  expect((await request.get(`${webOrigin}/api/public/articles/${originalSlug}`)).status()).toBe(200);

  await page.getByLabel("标题").fill("Browser lifecycle edited");
  await page.getByLabel("发布时间").fill("2026-01-02T03:04");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("更改已保存");
  await expect(page.getByLabel("发布时间")).toHaveValue(firstPublishedAt);

  const changedSlug = `${originalSlug}-changed`;
  await page.getByLabel("Slug").fill(changedSlug);
  await page.getByRole("button", { name: "保存更改" }).click();
  const slugDialog = page.getByRole("dialog", { name: "确认修改公开链接" });
  await expect(slugDialog).toBeVisible();
  await expect(slugDialog).toContainText(originalSlug);
  await expect(slugDialog).toContainText(changedSlug);
  expect((await request.get(`${webOrigin}/api/public/articles/${originalSlug}`)).status()).toBe(200);
  await slugDialog.getByRole("button", { name: "确认修改 Slug" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("更改已保存");
  expect((await request.get(`${webOrigin}/api/public/articles/${originalSlug}`)).status()).toBe(404);
  expect((await request.get(`${webOrigin}/api/public/articles/${changedSlug}`)).status()).toBe(200);

  await page.getByRole("button", { name: "下线" }).click();
  await expect(page.getByText("状态：已下线")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新发布" })).toBeVisible();
  await expect(page.getByLabel("发布时间")).toHaveValue(firstPublishedAt);
  expect((await request.get(`${webOrigin}/api/public/articles/${changedSlug}`)).status()).toBe(404);

  await page.getByRole("button", { name: "重新发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
  await expect(page.getByLabel("发布时间")).toHaveValue(firstPublishedAt);
  expect((await request.get(`${webOrigin}/api/public/articles/${changedSlug}`)).status()).toBe(200);

  await page.goto(`${webOrigin}/admin`);
  const row = page.getByTestId(`admin-post-${changedSlug}`);
  await expect(row).toContainText("Browser lifecycle edited");
  await expect(row).toContainText("已发布");
  await expect(page.getByRole("button", { name: /永久/ })).toHaveCount(0);
  await row.getByRole("button", { name: "删除" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "确认软删除文章" });
  await expect(deleteDialog).toContainText("源文件和 Slug 将继续保留");
  await deleteDialog.getByRole("button", { name: "确认软删除" }).click();
  await expect(row).toHaveCount(0);
  expect((await request.get(`${webOrigin}/api/public/articles/${changedSlug}`)).status()).toBe(404);
});
