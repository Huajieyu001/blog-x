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

test("administrator saves, reopens, and responsively previews a complete Markdown draft", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  await page.goto(`${webOrigin}/admin/new`);
  await expect(page.getByRole("heading", { name: "新建草稿" })).toBeVisible();
  await page.getByLabel("标题").fill("你好 TypeScript Café");
  await expect(page.getByLabel("Slug")).toHaveValue("你好-typescript-café");
  await page.getByLabel("Slug").fill(`manual-draft-${runId}`);
  const manualSlug = await page.getByLabel("Slug").inputValue();
  await page.getByLabel("标题").fill("标题改变后仍保留 Slug");
  await expect(page.getByLabel("Slug")).toHaveValue(manualSlug);

  await page.getByLabel("摘要").fill("完整元数据摘要");
  await page.getByLabel("发布时间").fill("2026-08-07T16:30");
  await page.getByLabel("SEO 描述").fill("完整元数据 SEO 描述");
  const markdown = "# 浏览器预览\n\n正文 **保留**\n\n<script>alert(1)</script>";
  await page.getByLabel("Markdown").fill(markdown);
  await expect(page.getByTestId("markdown-preview").getByRole("heading", { name: "浏览器预览" })).toBeVisible();
  await expect(page.getByTestId("markdown-preview").locator("script")).toHaveCount(0);
  await expect(page.getByTestId("editor-source")).toBeVisible();
  await expect(page.getByTestId("editor-preview-pane")).toBeVisible();

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]+$/);
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
  await page.reload();
  await expect(page.getByLabel("标题")).toHaveValue("标题改变后仍保留 Slug");
  await expect(page.getByLabel("摘要")).toHaveValue("完整元数据摘要");
  await expect(page.getByLabel("Slug")).toHaveValue(manualSlug);
  await expect(page.getByLabel("Markdown")).toHaveValue(markdown);
  await expect(page.getByLabel("发布时间")).toHaveValue("2026-08-07T16:30");
  await expect(page.getByLabel("SEO 描述")).toHaveValue("完整元数据 SEO 描述");

  await page.route("**/api/admin/posts/preview", async (route) => {
    const submitted = route.request().postDataJSON() as { markdown: string };
    if (submitted.markdown.includes("较慢的旧预览")) await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ html: submitted.markdown.includes("较新的预览") ? "<h1>较新的预览</h1>" : "<h1>较慢的旧预览</h1>" }),
    });
  });
  await page.getByLabel("Markdown").fill("# 较慢的旧预览");
  await page.waitForTimeout(350);
  await page.getByLabel("Markdown").fill("# 较新的预览");
  await expect(page.getByTestId("markdown-preview").getByRole("heading", { name: "较新的预览" })).toBeVisible();
  await page.waitForTimeout(750);
  await expect(page.getByTestId("markdown-preview").getByRole("heading", { name: "较新的预览" })).toBeVisible();
  await page.unroute("**/api/admin/posts/preview");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "编辑" })).toBeVisible();
  await expect(page.getByRole("button", { name: "预览" })).toBeVisible();
  const unsavedMarkdown = "# 尚未保存但不能丢失";
  await page.getByLabel("Markdown").fill(unsavedMarkdown);
  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.getByTestId("markdown-preview").getByRole("heading", { name: "尚未保存但不能丢失" })).toBeVisible();
  await expect(page.getByTestId("editor-source")).toBeHidden();
  await page.getByRole("button", { name: "编辑" }).click();
  await expect(page.getByLabel("Markdown")).toHaveValue(unsavedMarkdown);
  await page.getByLabel("标题").fill("");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("请修正标记的字段");
  await expect(page.getByLabel("Markdown")).toHaveValue(unsavedMarkdown);
});
