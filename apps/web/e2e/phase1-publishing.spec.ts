import { expect, test, type Page } from "@playwright/test";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const runId = process.env.E2E_RUN_ID;
const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";

type DraftInput = {
  title: string;
  slug: string;
  markdown: string;
  summary?: string;
  coverUrl?: string;
  seoDescription?: string;
};

async function createDraft(page: Page, input: DraftInput) {
  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(input.title);
  await page.getByLabel("摘要").fill(input.summary ?? "");
  await page.getByLabel("Slug").fill(input.slug);
  await page.getByLabel("封面 URL").fill(input.coverUrl ?? "");
  await page.getByLabel("SEO 描述").fill(input.seoDescription ?? "");
  await page.getByLabel("Markdown").fill(input.markdown);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]+$/);
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
  return page.url();
}

async function expectUnavailable(page: Page, slug: string) {
  const response = await page.goto(`${webOrigin}/posts/${slug}`);
  expect(response?.status()).toBe(404);
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

test("Phase 1 completes the local author-to-reader publishing journey through visible controls", async ({ page, context }) => {
  test.setTimeout(300_000);
  test.skip(!username || !password || !runId, "isolated verification credentials and run id are required");

  const browserApiRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    browserApiRequests.push(request.url());
    expect(url.origin).toBe(webOrigin);
  });

  await page.goto(`${webOrigin}/admin`);
  await expect(page).toHaveURL(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  await expect(page.getByRole("heading", { name: "文章管理" })).toBeVisible();

  const originalSlug = runId!;
  const changedSlug = `${runId}-changed`;
  const originalTitle = `Phase 1 publication ${runId}`;
  const editedTitle = `Phase 1 publication edited ${runId}`;
  const summary = "A complete local publishing acceptance article.";
  const markdown = [
    "## Reliable rendering",
    "",
    "> A visible quote from the authoring flow.",
    "",
    "| Layer | Responsibility |",
    "| --- | --- |",
    "| Browser | Render safe published content |",
    "",
    "[Safe documentation](https://example.com/docs)",
    "",
    "![Architecture diagram](https://images.example.test/architecture.png)",
    "",
    "```ts",
    "const published = true;",
    "```",
    "",
    "<script data-hostile=\"true\">window.hostile = true</script>",
    "<style>body { display: none }</style>",
    "[Unsafe destination](javascript:alert(1))",
  ].join("\n");

  const editorUrl = await createDraft(page, {
    title: originalTitle,
    summary,
    coverUrl: "https://images.example.test/phase-1-cover.png",
    slug: originalSlug,
    markdown,
    seoDescription: "Phase 1 local publishing acceptance metadata.",
  });
  await expect(page.getByLabel("发布时间", { exact: true })).toHaveValue("");
  await expect(page.getByTestId("markdown-preview").getByRole("heading", { name: "Reliable rendering" })).toBeVisible();
  await expect(page.getByTestId("markdown-preview").locator("script, style, [data-hostile]")).toHaveCount(0);

  await page.goto(webOrigin);
  await expect(page.getByRole("link", { name: originalTitle, exact: true })).toHaveCount(0);
  const draftNotFound = await expectUnavailable(page, originalSlug);

  await page.goto(editorUrl);
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
  const publishedAt = await page.getByLabel("发布时间", { exact: true }).inputValue();
  expect(publishedAt).not.toBe("");

  await page.goto(webOrigin);
  const firstCard = page.getByTestId("post-card").filter({ hasText: originalTitle });
  await expect(firstCard).toContainText(summary);
  await expect(firstCard).toContainText("已发布");
  await expect(firstCard.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  await firstCard.getByRole("link", { name: originalTitle, exact: true }).click();
  await expect(page).toHaveURL(`${webOrigin}/posts/${originalSlug}`);
  await expect(page.getByRole("heading", { level: 1, name: originalTitle })).toBeVisible();
  await expect(page.getByText(summary)).toBeVisible();
  const body = page.getByTestId("article-body");
  await expect(body.getByRole("heading", { name: "Reliable rendering" })).toBeVisible();
  await expect(body.locator("blockquote")).toBeVisible();
  await expect(body.locator("table")).toBeVisible();
  await expect(body.locator("pre.shiki")).toBeVisible();
  await expect(body.getByRole("link", { name: "Safe documentation" })).toHaveAttribute("href", "https://example.com/docs");
  await expect(body.getByRole("img", { name: "Architecture diagram" })).toHaveAttribute("src", "https://images.example.test/architecture.png");
  await expect(body.locator("script, style, [data-hostile], [onerror], [onclick]")).toHaveCount(0);
  await expect(body.getByText("Unsafe destination")).not.toHaveAttribute("href", /^(?:javascript|data):/i);

  await page.goto(editorUrl);
  await page.getByLabel("标题").fill(editedTitle);
  await page.getByLabel("摘要").fill(`${summary} Edited.`);
  await page.getByLabel("发布时间", { exact: true }).fill("2026-01-02T03:04");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("更改已保存");
  await expect(page.getByLabel("发布时间", { exact: true })).toHaveValue(publishedAt);

  await page.getByLabel("Slug").fill(changedSlug);
  await page.getByRole("button", { name: "保存更改" }).click();
  const slugDialog = page.getByRole("dialog", { name: "确认修改公开链接" });
  await expect(slugDialog).toContainText(originalSlug);
  await expect(slugDialog).toContainText(changedSlug);
  expect((await context.request.get(`${webOrigin}/posts/${originalSlug}`)).status()).toBe(200);
  await slugDialog.getByRole("button", { name: "确认修改 Slug" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("更改已保存");
  expect((await context.request.get(`${webOrigin}/posts/${originalSlug}`)).status()).toBe(404);
  expect((await context.request.get(`${webOrigin}/posts/${changedSlug}`)).status()).toBe(200);

  await page.getByRole("button", { name: "下线" }).click();
  await expect(page.getByText("状态：已下线")).toBeVisible();
  await expect(page.getByLabel("发布时间", { exact: true })).toHaveValue(publishedAt);
  await page.goto(webOrigin);
  await expect(page.getByRole("link", { name: editedTitle, exact: true })).toHaveCount(0);
  const unpublishedNotFound = await expectUnavailable(page, changedSlug);

  await page.goto(editorUrl);
  await page.getByRole("button", { name: "重新发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
  await expect(page.getByLabel("发布时间", { exact: true })).toHaveValue(publishedAt);
  expect((await context.request.get(`${webOrigin}/posts/${changedSlug}`)).status()).toBe(200);

  const draftSlug = `${runId}-hidden-draft`;
  const downlineSlug = `${runId}-hidden-downline`;
  const deletedSlug = `${runId}-hidden-deleted`;
  await createDraft(page, { title: "Hidden draft", slug: draftSlug, markdown: "# Hidden draft" });
  await createDraft(page, { title: "Hidden downline", slug: downlineSlug, markdown: "# Hidden downline" });
  await page.getByRole("button", { name: "发布" }).click();
  await page.getByRole("button", { name: "下线" }).click();
  await createDraft(page, { title: "Hidden deleted", slug: deletedSlug, markdown: "# Hidden deleted" });
  await page.getByRole("button", { name: "发布" }).click();
  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("dialog", { name: "确认软删除文章" }).getByRole("button", { name: "确认软删除" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  for (let index = 1; index <= 10; index += 1) {
    await createDraft(page, {
      title: `Pagination article ${String(index).padStart(2, "0")}`,
      summary: `Pagination summary ${index}`,
      slug: `${runId}-page-${index}`,
      markdown: `# Pagination article ${index}`,
    });
    await page.getByRole("button", { name: "发布" }).click();
    await expect(page.getByText("状态：已发布")).toBeVisible();
  }

  await page.goto(webOrigin);
  await expect(page.getByText("共 11 篇 · 第 1 页")).toBeVisible();
  await expect(page.getByTestId("post-card")).toHaveCount(10);
  await expect(page.getByText("Hidden draft")).toHaveCount(0);
  await expect(page.getByText("Hidden downline")).toHaveCount(0);
  await expect(page.getByText("Hidden deleted")).toHaveCount(0);
  const pagination = page.getByRole("navigation", { name: "文章分页" });
  await expect(pagination.getByRole("link", { name: "下一页" })).toHaveAttribute("href", "/?page=2");
  await pagination.getByRole("link", { name: "下一页" }).click();
  await expect(page.getByText("共 11 篇 · 第 2 页")).toBeVisible();
  await expect(page.getByTestId("post-card")).toHaveCount(1);

  const unavailableBodies = [draftNotFound, unpublishedNotFound];
  for (const slug of [draftSlug, downlineSlug, deletedSlug, `${runId}-unknown`]) {
    unavailableBodies.push(await expectUnavailable(page, slug));
  }
  expect(new Set(unavailableBodies).size).toBe(1);

  await page.goto(editorUrl);
  await page.getByRole("button", { name: "删除" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "确认软删除文章" });
  await expect(deleteDialog).toContainText("源文件和 Slug 将继续保留");
  await deleteDialog.getByRole("button", { name: "确认软删除" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  expect((await context.request.get(`${webOrigin}/posts/${changedSlug}`)).status()).toBe(404);

  expect(browserApiRequests.length).toBeGreaterThan(0);
});
