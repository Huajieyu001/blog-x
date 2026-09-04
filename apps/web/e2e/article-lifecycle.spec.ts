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

test("draft completes publish, edit, slug confirmation, unpublish, republish, and soft-delete through visible controls", async ({ page, context }) => {
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  await page.goto(`${webOrigin}/admin/new`);
  const originalSlug = `browser-lifecycle-${runId}`;
  const originalTitle = `Browser lifecycle article ${runId}`;
  const editedTitle = `Browser lifecycle edited ${runId}`;
  await page.getByLabel("标题").fill(originalTitle);
  await page.getByLabel("摘要").fill("Lifecycle browser summary");
  await page.getByLabel("Slug").fill(originalSlug);
  await page.getByLabel("Markdown").fill("# Browser lifecycle\n\nOriginal content");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]+$/);
  await expect(page.getByTestId("native-lifecycle-fallback")).toBeHidden();
  await expect(page.getByRole("button", { name: "发布" })).toBeVisible();
  await expect(page.getByRole("button", { name: "下线" })).toHaveCount(0);

  const scheduleForm = page.getByRole("form", { name: "预约发布" });
  await scheduleForm.getByLabel("预约发布时间").fill("2032-01-01T09:30");
  await scheduleForm.getByLabel("UTC 偏移").fill("+08:00");
  await page.getByRole("button", { name: "设定预约" }).click();
  await expect(page.getByRole("status", { name: "生命周期状态" })).toHaveText("已设定预约");
  await expect(page.getByText("当前预约：2032-01-01T01:30:00.000Z")).toBeVisible();
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const scheduleButton = await page.getByRole("button", { name: "改期预约" }).boundingBox();
    expect(scheduleButton?.height).toBeGreaterThanOrEqual(44);
  }
  await scheduleForm.getByLabel("预约发布时间").fill("2032-01-02T09:30");
  await page.getByRole("button", { name: "改期预约" }).click();
  await expect(page.getByRole("status", { name: "生命周期状态" })).toHaveText("改期预约成功");
  await expect(page.getByText("当前预约：2032-01-02T01:30:00.000Z")).toBeVisible();
  await page.getByRole("button", { name: "取消预约" }).click();
  await expect(page.getByRole("status", { name: "生命周期状态" })).toHaveText("已取消预约发布");
  await expect(page.getByText("当前预约：")).toHaveCount(0);

  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
  const firstPublishedAt = await page.getByLabel("首次发布时间更正", { exact: true }).inputValue();
  expect(firstPublishedAt).not.toBe("");
  await expect(page.getByLabel("预约发布时间", { exact: true })).toHaveCount(0);
  expect((await context.request.get(`${webOrigin}/api/public/articles/${originalSlug}`)).status()).toBe(200);

  await page.getByLabel("标题").fill(editedTitle);
  await page.getByLabel("首次发布时间更正", { exact: true }).fill("2026-01-02T03:04");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("更改已保存");
  await expect(page.getByLabel("首次发布时间更正", { exact: true })).toHaveValue(firstPublishedAt);

  const changedSlug = `${originalSlug}-changed`;
  await page.getByLabel("Slug").fill(changedSlug);
  await page.getByRole("button", { name: "保存更改" }).click();
  const slugDialog = page.getByRole("dialog", { name: "确认修改公开链接" });
  await expect(slugDialog).toBeVisible();
  await expect(slugDialog).toContainText(originalSlug);
  await expect(slugDialog).toContainText(changedSlug);
  expect((await context.request.get(`${webOrigin}/api/public/articles/${originalSlug}`)).status()).toBe(200);
  await slugDialog.getByRole("button", { name: "确认修改 Slug" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("更改已保存");
  expect((await context.request.get(`${webOrigin}/api/public/articles/${originalSlug}`)).status()).toBe(404);
  expect((await context.request.get(`${webOrigin}/api/public/articles/${changedSlug}`)).status()).toBe(200);

  await page.getByRole("button", { name: "下线" }).click();
  await expect(page.getByText("状态：已下线")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新发布" })).toBeVisible();
  await expect(page.getByLabel("首次发布时间更正", { exact: true })).toHaveValue(firstPublishedAt);
  expect((await context.request.get(`${webOrigin}/api/public/articles/${changedSlug}`)).status()).toBe(404);

  await page.getByRole("button", { name: "重新发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
  await expect(page.getByLabel("首次发布时间更正", { exact: true })).toHaveValue(firstPublishedAt);
  expect((await context.request.get(`${webOrigin}/api/public/articles/${changedSlug}`)).status()).toBe(200);

  await page.goto(`${webOrigin}/admin`);
  const row = page.getByTestId(`admin-post-${changedSlug}`);
  await expect(row).toContainText(editedTitle);
  await expect(row).toContainText("已发布");
  await expect(page.getByRole("button", { name: /永久/ })).toHaveCount(0);
  await row.getByRole("button", { name: "删除" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "确认软删除文章" });
  await expect(deleteDialog).toContainText("源文件和 Slug 将继续保留");
  await deleteDialog.getByRole("button", { name: "确认软删除" }).click();
  await expect(row).toHaveCount(0);
  expect((await context.request.get(`${webOrigin}/api/public/articles/${changedSlug}`)).status()).toBe(404);

  await page.goto(`${webOrigin}/admin/audit`);
  await expect(page.getByRole("heading", { name: "操作日志" })).toBeVisible();
  const audit = page.getByLabel("管理员操作记录");
  await expect(audit.getByText("创建文章草稿").first()).toBeVisible();
  await expect(audit.getByText("发布文章").first()).toBeVisible();
  await expect(audit.getByText("下线文章").first()).toBeVisible();
  await expect(audit.getByText("重新发布文章").first()).toBeVisible();
  await expect(audit.getByText("删除文章").first()).toBeVisible();
  await expect(audit.getByText("预约发布文章").first()).toBeVisible();
  await expect(audit.getByText("改期发布文章").first()).toBeVisible();
  await expect(audit.getByText("取消预约发布").first()).toBeVisible();
  await expect(audit).not.toContainText(originalTitle);
  await expect(audit).not.toContainText(editedTitle);
  await expect(audit).not.toContainText("Original content");
  await expect(audit).not.toContainText(changedSlug);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("schedule form remains a no-script, keyboard-operable same-origin control", async ({ browser }) => {
  const noJsContext = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await noJsContext.newPage();
    const login = await noJsContext.request.post(`${webOrigin}/api/auth/login`, {
      headers: { origin: webOrigin, "content-type": "application/json" },
      data: { username, password },
    });
    expect(login.status()).toBe(200);
    const slug = `browser-nojs-schedule-${runId}`;
    const created = await noJsContext.request.post(`${webOrigin}/api/admin/posts`, {
      headers: { origin: webOrigin, "content-type": "application/json" },
      data: { title: "No script schedule", summary: "", coverUrl: "", slug, markdown: "# No script", publishedAt: null, seoDescription: "" },
    });
    expect(created.status()).toBe(201);
    const article = await created.json() as { id: string };
    const detailUrl = `${webOrigin}/admin/posts/${article.id}`;
    await page.goto(detailUrl);

    const schedule = page.getByRole("form", { name: "预约发布" });
    await expect(page.getByTestId("native-lifecycle-fallback")).toBeVisible();
    await expect(schedule).toBeVisible();
    const scheduleAction = new URL(await schedule.getAttribute("action") ?? "", webOrigin);
    expect(scheduleAction.origin).toBe(new URL(webOrigin).origin);
    expect(scheduleAction.pathname).toBe(`/api/admin/posts/${article.id}/schedule`);
    await schedule.getByLabel("预约发布时间").fill("2032-02-01T09:30");
    await schedule.getByLabel("UTC 偏移").fill("+08:00");
    const [scheduleResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && response.url() === scheduleAction.href),
      page.waitForNavigation({ waitUntil: "load" }),
      schedule.getByRole("button", { name: "设定预约" }).press("Enter"),
    ]);
    expect(scheduleResponse.status()).toBe(302);
    expect(scheduleResponse.headers()["location"]).toBe(`/admin/posts/${article.id}`);
    await expect(page).toHaveURL(detailUrl);
    const scheduledPost = await noJsContext.request.get(`${webOrigin}/api/admin/posts/${article.id}`);
    expect(scheduledPost.status()).toBe(200);
    expect((await scheduledPost.json() as { scheduledAt: string | null }).scheduledAt).toBe("2032-02-01T01:30:00.000Z");
    await expect(page.getByText("当前预约：2032-02-01T01:30:00.000Z")).toBeVisible();

    const cancel = page.getByRole("button", { name: "取消预约" }).locator("..");
    const cancelAction = new URL(await cancel.getAttribute("action") ?? "", webOrigin);
    expect(cancelAction.origin).toBe(new URL(webOrigin).origin);
    expect(cancelAction.pathname).toBe(`/api/admin/posts/${article.id}/schedule/cancel`);
    const [cancelResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && response.url() === cancelAction.href),
      page.waitForNavigation({ waitUntil: "load" }),
      cancel.getByRole("button", { name: "取消预约" }).press("Enter"),
    ]);
    expect(cancelResponse.status()).toBe(302);
    expect(cancelResponse.headers()["location"]).toBe(`/admin/posts/${article.id}`);
    await expect(page).toHaveURL(detailUrl);
    const cancelledPost = await noJsContext.request.get(`${webOrigin}/api/admin/posts/${article.id}`);
    expect(cancelledPost.status()).toBe(200);
    expect((await cancelledPost.json() as { scheduledAt: string | null }).scheduledAt).toBeNull();
    await expect(page.getByText("当前预约：")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "设定预约" })).toBeVisible();
  } finally {
    await noJsContext.close();
  }
});
