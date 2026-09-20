import { expect, test } from "@playwright/test";

function requiredRunnerFact(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required from the generated main-browser fixture`);
  return value;
}

const username = requiredRunnerFact("E2E_ADMIN_USERNAME");
const password = requiredRunnerFact("E2E_ADMIN_PASSWORD");
const runId = requiredRunnerFact("E2E_RUN_ID");
const webOrigin = requiredRunnerFact("E2E_WEB_ORIGIN");

test("administrator compares and restores a bounded article history without rendering historic markup", async ({ page }) => {
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  await page.goto(`${webOrigin}/admin/new`);
  await expect(page.getByLabel("标题")).toBeVisible();
  const slug = `revision-${runId}`;
  await page.getByLabel("标题").fill("历史标题");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Markdown").fill("# 原始内容\n\n<script>alert(1)</script>");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]+$/);
  await expect(page.getByRole("status").filter({ hasText: "草稿已保存" })).toBeVisible();
  await page.getByLabel("标题").fill("当前标题");
  await page.getByLabel("Markdown").fill(`# 当前内容\n\n${"很长的内容 ".repeat(900)}`);
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByTestId("article-revision-history")).toContainText("标题、正文");
  await page.getByRole("button", { name: "查看对比" }).click();
  const comparison = page.locator("#revision-comparison");
  await expect(comparison).toContainText("历史标题");
  await expect(comparison).toContainText("当前标题");
  await expect(comparison.locator("script")).toHaveCount(0);
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  const restoreButton = page.getByRole("button", { name: "恢复此版本" });
  await restoreButton.click();
  const dialog = page.getByRole("dialog", { name: /确认恢复此历史版本/ });
  await expect(dialog).toContainText("当前内容会先保存为新的历史版本");
  const restoreConfirm = dialog.getByRole("button", { name: "确认恢复" });
  const restoreCancel = dialog.getByRole("button", { name: "取消" });
  await expect(restoreCancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(restoreConfirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(restoreCancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(restoreButton).toBeFocused();
  await restoreButton.click();
  await restoreCancel.click();
  await expect(restoreButton).toBeFocused();
  await page.route("**/api/admin/posts/*/revisions/*/restore", async (route) => {
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "stale" }) });
  });
  await restoreButton.click();
  await restoreConfirm.click();
  await expect(page.getByTestId("article-revision-history").getByRole("alert")).toHaveText("文章已被其他保存更新，请刷新后重新选择历史版本。");
  await expect(restoreButton).toBeFocused();
  await page.unroute("**/api/admin/posts/*/revisions/*/restore");
  let releaseRestore: (() => void) | undefined;
  let markRestoreRequestStarted: (() => void) | undefined;
  const restoreRequestStarted = new Promise<void>((resolve) => {
    markRestoreRequestStarted = resolve;
  });
  await page.route("**/api/admin/posts/*/revisions/*/restore", async (route) => {
    markRestoreRequestStarted?.();
    await new Promise<void>((release) => { releaseRestore = release; });
    await route.continue();
  });
  await restoreButton.click();
  await restoreConfirm.click();
  await restoreRequestStarted;
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog).toBeVisible();
  releaseRestore?.();
  await page.unroute("**/api/admin/posts/*/revisions/*/restore");
  await expect(page.getByLabel("标题")).toHaveValue("历史标题");
  await expect(page.getByLabel("Markdown")).toHaveValue(/<script>alert\(1\)<\/script>/);
  await expect(page.getByText("状态：草稿")).toBeVisible();
});
