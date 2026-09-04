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

test("administrator saves, recovers, and responsively previews a complete Markdown draft", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  await page.goto(`${webOrigin}/admin/new`);
  await expect(page.getByRole("heading", { name: "新建草稿" })).toBeVisible();
  await page.getByLabel("标题").fill("刷新前的未完成标题");
  await page.getByLabel("Markdown").fill("# 刷新前的未完成正文");
  await expect(page.getByRole("status", { name: "恢复副本状态" })).toHaveText("未保存的更改已保存到本机恢复副本");
  await page.reload();
  const recovery = page.getByTestId("editor-recovery-notice");
  await expect(recovery.getByRole("heading", { name: "发现未保存的内容" })).toBeVisible();
  await expect(page.locator("main button").filter({ hasText: "保存草稿" })).toBeDisabled();
  await expect(page.locator("header").filter({ hasText: "退出登录" })).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
  await expect(recovery.getByRole("button", { name: "恢复内容" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(recovery.getByRole("button", { name: "放弃副本" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(recovery.getByRole("button", { name: "恢复内容" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(recovery).toContainText("为避免误删，请明确选择恢复内容或放弃副本");
  await expect(page.getByLabel("标题")).toHaveValue("");
  await recovery.getByRole("button", { name: "恢复内容" }).click();
  await expect(page.getByLabel("标题")).toBeFocused();
  await expect(page.getByLabel("标题")).toHaveValue("刷新前的未完成标题");
  await expect(page.getByLabel("Markdown")).toHaveValue("# 刷新前的未完成正文");
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("已恢复未保存的内容，请确认后手动保存");

  await page.getByLabel("标题").fill("你好 TypeScript Café");
  await expect(page.getByLabel("Slug")).toHaveValue("你好-typescript-café");
  await page.getByLabel("Slug").fill(`manual-draft-${runId}`);
  const manualSlug = await page.getByLabel("Slug").inputValue();
  await page.getByLabel("标题").fill("标题改变后仍保留 Slug");
  await expect(page.getByLabel("Slug")).toHaveValue(manualSlug);

  await page.getByLabel("摘要").fill("完整元数据摘要");
  await expect(page.getByText("首次公开发布时间会在成功发布时由系统记录；预约发布时间请在下方“文章生命周期”中单独设置。")).toBeVisible();
  await expect(page.getByLabel("首次发布时间更正", { exact: true })).toHaveCount(0);
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
  await expect(page.getByText("首次公开发布时间会在成功发布时由系统记录；预约发布时间请在下方“文章生命周期”中单独设置。")).toBeVisible();
  await expect(page.getByLabel("首次发布时间更正", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("SEO 描述")).toHaveValue("完整元数据 SEO 描述");

  let releaseSave!: () => void;
  let markSaveIntercepted!: () => void;
  const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
  const saveIntercepted = new Promise<void>((resolve) => { markSaveIntercepted = resolve; });
  const articleId = page.url().split("/").at(-1);
  await page.route(`${webOrigin}/api/admin/posts/${articleId}`, async (route) => {
    markSaveIntercepted();
    await saveGate;
    await route.continue();
  }, { times: 1 });
  try {
    await page.getByLabel("标题").fill("提交请求中的标题");
    await page.getByRole("button", { name: "保存更改" }).click();
    await saveIntercepted;
    await expect(page.getByRole("button", { name: "保存中…" })).toBeDisabled();
    await page.getByLabel("标题").fill("请求期间继续输入的标题");
    releaseSave();
    await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("提交时的内容已保存；之后的编辑仍保留");
    await expect(page.getByLabel("标题")).toHaveValue("请求期间继续输入的标题");
    await expect(page.getByRole("button", { name: "发布" })).toBeDisabled();
  } finally {
    releaseSave();
    await page.unrouteAll({ behavior: "wait" });
  }

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
  await expect(page.getByRole("status", { name: "恢复副本状态" })).toHaveText("未保存的更改已保存到本机恢复副本");
  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.getByTestId("markdown-preview").getByRole("heading", { name: "尚未保存但不能丢失" })).toBeVisible();
  await expect(page.getByTestId("editor-source")).toBeHidden();
  await page.getByRole("button", { name: "编辑" }).click();
  await expect(page.getByLabel("Markdown")).toHaveValue(unsavedMarkdown);
  await page.reload();
  await expect(page.getByTestId("editor-recovery-notice")).toBeVisible();
  await page.getByTestId("editor-recovery-notice").getByRole("button", { name: "恢复内容" }).click();
  await expect(page.getByLabel("Markdown")).toHaveValue(unsavedMarkdown);
  await page.getByLabel("标题").fill("");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("请修正标记的字段");
  await expect(page.getByLabel("Markdown")).toHaveValue(unsavedMarkdown);

  await page.getByLabel("标题").fill("恢复后的最新标题");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("更改已保存");
  const editUrl = page.url();
  await page.getByLabel("Markdown").fill("# 本机未保存的旧版本正文");
  await expect(page.getByRole("status", { name: "恢复副本状态" })).toHaveText("未保存的更改已保存到本机恢复副本");

  const newerPage = await context.newPage();
  await newerPage.goto(editUrl);
  await newerPage.getByLabel("摘要").fill("另一标签页写入的服务器新版");
  await newerPage.getByRole("button", { name: "保存更改" }).click();
  await expect(newerPage.getByRole("status", { name: "编辑器状态" })).toHaveText("更改已保存");
  await newerPage.close();

  await page.reload();
  const staleRecovery = page.getByTestId("editor-recovery-notice");
  await expect(staleRecovery).toContainText("服务器版本已变化");
  await expect(page.getByLabel("Markdown")).toHaveValue(unsavedMarkdown);
  await staleRecovery.getByRole("button", { name: "恢复内容" }).click();
  await expect(page.getByLabel("Markdown")).toHaveValue("# 本机未保存的旧版本正文");
  await expect(page.getByRole("heading", { name: "恢复内容基于较旧的服务器版本" })).toBeVisible();
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("恢复副本基于较旧版本；请先确认是否覆盖服务器版本");
  await page.getByRole("button", { name: "使用服务器版本" }).click();
  await expect(page.getByLabel("Markdown")).toHaveValue(unsavedMarkdown);
  await expect(page.getByRole("heading", { name: "恢复内容基于较旧的服务器版本" })).toHaveCount(0);
});

test("manual draft saving remains available when browser recovery storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() { throw new DOMException("blocked", "SecurityError"); },
    });
  });
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  await page.goto(`${webOrigin}/admin/new`);
  await expect(page.getByRole("status", { name: "恢复副本状态" })).toHaveText("浏览器存储不可用；请及时手动保存");
  await page.getByLabel("标题").fill("无恢复存储仍可保存");
  await page.getByLabel("Slug").fill(`storage-blocked-${runId}`);
  await page.getByLabel("Markdown").fill("# 手动保存仍然有效");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]+$/);
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
});
