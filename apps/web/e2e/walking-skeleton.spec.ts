import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const processes: ChildProcess[] = [];

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* process is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test.beforeAll(async () => {
  const api = spawn(process.execPath, ["--import", "tsx", "apps/api/src/app.ts"], { stdio: "ignore", env: process.env });
  processes.push(api); await waitFor("http://127.0.0.1:3001/health");
  const web = spawn("corepack", ["pnpm", "exec", "next", "dev", "apps/web", "-p", "3000"], { stdio: "ignore", env: process.env });
  processes.push(web); await waitFor("http://127.0.0.1:3000");
});
test.afterAll(() => { for (const process of processes) process.kill("SIGTERM"); });

test("administrator publishes Markdown that is immediately SSR-readable", async ({ page }) => {
  test.skip(!username || !password, "E2E administrator credentials are required");
  const slug = `walking-skeleton-${Date.now()}`;

  await page.goto("/");
  await page.getByRole("link", { name: "管理" }).click();
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "发布文章" })).toBeVisible();
  await page.getByLabel("标题").fill("Walking skeleton");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Markdown").fill("# Hello\n\n| A | B |\n| - | - |\n| 1 | 2 |");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByRole("link", { name: "Walking skeleton" })).toBeVisible();
  await page.getByRole("link", { name: "Walking skeleton" }).click();
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible();
});
