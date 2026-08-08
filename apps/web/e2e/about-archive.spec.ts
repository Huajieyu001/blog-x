import { expect, test, type Page } from "@playwright/test";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";

async function createPublishedPost(page: Page, input: { title: string; slug: string; publishedAt: string }) {
  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(input.title);
  await page.getByLabel("Slug").fill(input.slug);
  await page.getByLabel("发布时间").fill(input.publishedAt);
  await page.getByLabel("Markdown").fill(`# ${input.title}`);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
}

test("archive renders a valid native-details or exact empty state", async ({ page }) => {
  await page.goto("/archives");
  await expect(page.getByRole("heading", { name: "归档", exact: true })).toBeVisible();
  const details = page.locator("details");
  if (await details.count()) {
    await expect(details.first()).toHaveAttribute("open", "");
  } else {
    await expect(page.getByRole("heading", { name: "还没有可归档的文章" })).toBeVisible();
    await expect(page.getByText("发布文章后会按时间显示在这里。")).toBeVisible();
  }
});

test("public About is either published content or the generic true 404", async ({ page }) => {
  const response = await page.goto("/about");
  if (response?.status() === 404) {
    await expect(page.getByText("没有找到这个页面")).toBeVisible();
    await expect(page.getByText("它可能已被移动，或尚未发布。")).toBeVisible();
  } else {
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("article-body")).toBeVisible();
  }
});

test("administrator drafts, safely previews, publishes About, and exposes chronological archives", async ({ page }) => {
  test.skip(!username || !password, "E2E administrator credentials are required");
  const runId = process.env.E2E_RUN_ID ?? String(Date.now());
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  await page.goto(`${webOrigin}/admin/about`);
  await expect(page.getByText("状态：草稿")).toBeVisible();
  const title = `关于 Blog X ${runId}`;
  const markdown = "# 安全的关于页\n\n<script>window.aboutLeak = true</script>\n\n```ts\nconst safe = true;\n```";
  await page.getByLabel("标题").fill(title);
  await page.getByLabel("Markdown").fill(markdown);
  await page.getByRole("button", { name: "更新预览" }).click();
  await expect(page.getByRole("status", { name: "关于页编辑状态" })).toHaveText("预览已更新。");
  const preview = page.getByTestId("about-editor-preview");
  await expect(preview.getByRole("heading", { name: "安全的关于页" })).toBeVisible();
  await expect(preview.locator("script")).toHaveCount(0);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "关于页编辑状态" })).toHaveText("草稿已保存。");
  const draftResponse = await page.goto(`${webOrigin}/about`);
  expect(draftResponse?.status()).toBe(404);
  await expect(page.getByText("没有找到这个页面")).toBeVisible();

  await page.goto(`${webOrigin}/admin/about`);
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByRole("status", { name: "关于页编辑状态" })).toHaveText("关于页已发布。");
  await expect(page.getByText("状态：已发布")).toBeVisible();
  await page.getByRole("link", { name: "查看公开关于页" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const publicBody = page.getByTestId("article-body");
  await expect(publicBody.getByRole("heading", { name: "安全的关于页" })).toBeVisible();
  await expect(publicBody.locator("script")).toHaveCount(0);

  await createPublishedPost(page, { title: `Archive 2025 ${runId}`, slug: `archive-2025-${runId}`, publishedAt: "2025-06-01T12:00" });
  await createPublishedPost(page, { title: `Archive 2026 ${runId}`, slug: `archive-2026-${runId}`, publishedAt: "2026-06-01T12:00" });
  await page.goto(`${webOrigin}/archives`);
  const years = page.locator("details");
  await expect(years).toHaveCount(2);
  await expect(years.nth(0)).toHaveAttribute("open", "");
  await expect(years.nth(1)).not.toHaveAttribute("open", "");
  await years.nth(1).locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(years.nth(1)).toHaveAttribute("open", "");
});
