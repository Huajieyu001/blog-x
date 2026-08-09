import { expect, test } from "@playwright/test";

const webOrigin = process.env.E2E_ERROR_WEB_ORIGIN ?? "http://127.0.0.1:3300";

async function expectUnavailable(page: import("@playwright/test").Page, path: string) {
  await page.goto(`${webOrigin}${path}`);
  const boundary = page.getByTestId("service-unavailable");
  await expect(boundary.getByRole("heading", { name: "暂时无法加载内容" })).toBeVisible();
  await expect(boundary.getByText("服务似乎暂时不可用，请重试或返回首页。")).toBeVisible();
  await expect(boundary.getByRole("button", { name: "重试" })).toBeVisible();
  await expect(boundary.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/");
  await expect(page.getByText("没有找到这个页面")).toHaveCount(0);
  await expect(page.getByText("这一页还没有文章")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/ECONNREFUSED|INTERNAL_API_ORIGIN|ZodError|127\.0\.0\.1:3399/);
}

test("only a valid API absence becomes 404 while 500, refusal, and malformed DTO use safe recovery", async ({ page }) => {
  const unknown = await page.goto(`${webOrigin}/route-that-does-not-exist`);
  expect(unknown?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "没有找到这个页面" })).toBeVisible();
  await expect(page.getByText("它可能已被移动，或尚未发布。")).toBeVisible();

  const missing = await page.goto(`${webOrigin}/posts/missing`);
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "没有找到这个页面" })).toBeVisible();
  await expect(page.getByText("暂时无法加载内容")).toHaveCount(0);

  await expectUnavailable(page, "/posts/failure");
  await expectUnavailable(page, "/posts/refused");
  await expectUnavailable(page, "/posts/malformed");
  await expectUnavailable(page, "/posts/malformed-404");
});

test("retry can recover a transient About failure without exposing internals", async ({ page }) => {
  await page.goto(`${webOrigin}/about`);
  const boundary = page.getByTestId("service-unavailable");
  await expect(boundary).toBeVisible();
  await boundary.getByRole("button", { name: "重试" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "关于错误恢复" })).toBeVisible();
  await expect(page.getByTestId("article-body")).toContainText("恢复后的公开内容");
});
