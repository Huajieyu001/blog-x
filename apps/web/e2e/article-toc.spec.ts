import { expect, test, type Page } from "@playwright/test";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const runId = process.env.E2E_RUN_ID ?? String(Date.now());
const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";

async function createPublishedPost(page: Page, input: { title: string; slug: string; markdown: string }) {
  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(input.title);
  await page.getByLabel("Slug").fill(input.slug);
  await page.getByLabel("Markdown").fill(input.markdown);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
}

test("server-owned article ToC keeps stable multilingual anchors across responsive and no-JS reading", async ({ browser, page }) => {
  test.skip(!username || !password, "E2E administrator credentials are required");
  test.setTimeout(180_000);

  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  const tocSlug = `toc-${runId}`;
  await createPublishedPost(page, {
    title: `目录文章 ${runId}`,
    slug: tocSlug,
    markdown: [
      "# 不进入目录的标题",
      "",
      "## 中文 架构",
      "",
      "正文。",
      "",
      "### API / Design",
      "",
      "## 中文 架构",
      "",
      "## !!!",
      "",
      "#### 不进入目录的小节",
    ].join("\n"),
  });

  const emptySlug = `toc-empty-${runId}`;
  await createPublishedPost(page, {
    title: `无目录文章 ${runId}`,
    slug: emptySlug,
    markdown: "# 一级标题\n\n正文。\n\n#### 四级标题",
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${webOrigin}/posts/${tocSlug}`);
  const desktopToc = page.locator('nav[data-testid="article-toc"]');
  await expect(desktopToc).toBeVisible();
  await expect(page.locator('details[data-testid="article-toc"]')).toBeHidden();
  expect(await desktopToc.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  await expect(desktopToc.getByTestId("toc-link")).toHaveCount(4);
  await expect(desktopToc.getByTestId("toc-link").nth(0)).toHaveAttribute("href", "#中文-架构");
  await expect(desktopToc.getByTestId("toc-link").nth(1)).toHaveAttribute("href", "#api-design");
  await expect(desktopToc.getByTestId("toc-link").nth(2)).toHaveAttribute("href", "#中文-架构-2");
  await expect(desktopToc.getByTestId("toc-link").nth(3)).toHaveAttribute("href", "#section");
  await expect(page.locator("#中文-架构")).toHaveCount(1);
  await expect(page.locator("#中文-架构-2")).toHaveCount(1);
  await expect(page.locator("#中文-架构 > .heading-permalink")).toHaveAttribute("aria-label", "链接到“中文 架构”");

  await page.setViewportSize({ width: 375, height: 812 });
  const narrowToc = page.locator('details[data-testid="article-toc"]');
  await expect(narrowToc).toBeVisible();
  await expect(narrowToc).not.toHaveAttribute("open", "");
  const summary = narrowToc.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(narrowToc).toHaveAttribute("open", "");
  expect(await narrowToc.evaluate((toc, body) => Boolean(toc.compareDocumentPosition(body as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await page.getByTestId("article-body").elementHandle())).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(narrowToc).toBeVisible();
  await expect(desktopToc).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${webOrigin}/posts/${emptySlug}`);
  await expect(page.getByTestId("article-toc")).toHaveCount(0);
  const headingFreeContent = page.getByTestId("article-content");
  await expect(headingFreeContent).toBeVisible();
  const headingFreeLayout = await headingFreeContent.evaluate((element) => {
    const style = getComputedStyle(element);
    return { columns: style.gridTemplateColumns.split(" ").length, width: element.getBoundingClientRect().width };
  });
  expect(headingFreeLayout.columns).toBe(1);
  expect(headingFreeLayout.width).toBeLessThanOrEqual(761);

  const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto(`${webOrigin}/posts/${tocSlug}`);
  await noJsPage.locator('nav[data-testid="article-toc"] a[href="#api-design"]').click();
  await expect(noJsPage).toHaveURL(new RegExp(`/posts/${tocSlug}#api-design$`));
  await expect(noJsPage.locator("#api-design")).toBeVisible();
  await noJsContext.close();
});
