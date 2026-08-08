import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;
const webOrigin = "http://127.0.0.1:3100";
const processes: ChildProcess[] = [];

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* process is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function createDraft(page: Page, input: { title: string; summary: string; slug: string; markdown: string }) {
  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(input.title);
  await page.getByLabel("摘要").fill(input.summary);
  await page.getByLabel("Slug").fill(input.slug);
  await page.getByLabel("Markdown").fill(input.markdown);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]+$/);
  return page.url();
}

test.beforeAll(async () => {
  if (!databaseUrl) return;
  const api = spawn(process.execPath, ["--import", "tsx", "apps/api/src/app.ts"], { stdio: "ignore", env: process.env });
  processes.push(api); await waitFor("http://127.0.0.1:3001/health");
  const web = spawn(process.execPath, ["apps/web/node_modules/next/dist/bin/next", "dev", "apps/web", "-p", "3100"], { stdio: "ignore", env: process.env });
  processes.push(web); await waitFor(webOrigin);
});

test.afterAll(() => { for (const process of processes) process.kill("SIGTERM"); });

test("published permalink is a safe focused technical reading surface and every unavailable state is one 404", async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!username || !password || !databaseUrl, "E2E database and administrator credentials are required");

  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  const suffix = Date.now();
  const slugs = {
    published: `technical-reading-${suffix}`,
    draft: `hidden-draft-${suffix}`,
    unpublished: `hidden-unpublished-${suffix}`,
    deleted: `hidden-deleted-${suffix}`,
  };
  const markdown = [
    "## Reliable rendering",
    "",
    "> Technical writing should remain calm and readable.",
    "",
    "| Layer with an intentionally long heading | Responsibility |",
    "| --- | --- |",
    "| Browser | Read server-rendered content without executing author markup |",
    "",
    "[Safe documentation](https://example.com/docs)",
    "",
    "![Architecture diagram](https://images.example.test/architecture.png)",
    "",
    "```ts",
    "const intentionallyLongValue = 'abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz';",
    "console.log(intentionallyLongValue);",
    "```",
    "",
    "<script data-hostile=\"true\">window.hostile = true</script>",
    "<style>body { display: none }</style>",
    "[Unsafe destination](javascript:alert(1))",
  ].join("\n");

  await createDraft(page, { title: "A focused technical article", summary: "A concise introduction to the reading surface.", slug: slugs.published, markdown });
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();

  await createDraft(page, { title: "Draft secret", summary: "hidden", slug: slugs.draft, markdown: "# Draft secret" });
  await createDraft(page, { title: "Unpublished secret", summary: "hidden", slug: slugs.unpublished, markdown: "# Unpublished secret" });
  await page.getByRole("button", { name: "发布" }).click();
  await page.getByRole("button", { name: "下线" }).click();
  await createDraft(page, { title: "Deleted secret", summary: "hidden", slug: slugs.deleted, markdown: "# Deleted secret" });
  await page.getByRole("button", { name: "发布" }).click();
  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("dialog", { name: "确认软删除文章" }).getByRole("button", { name: "确认软删除" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  await page.setViewportSize({ width: 1280, height: 900 });
  const publishedResponse = await page.goto(`${webOrigin}/posts/${slugs.published}`);
  expect(publishedResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "A focused technical article" })).toBeVisible();
  await expect(page.getByText("A concise introduction to the reading surface.")).toBeVisible();
  await expect(page.locator("article time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  const body = page.getByTestId("article-body");
  await expect(body.getByRole("heading", { level: 2, name: "Reliable rendering" })).toBeVisible();
  await expect(body.locator("blockquote")).toBeVisible();
  await expect(body.locator("table")).toBeVisible();
  await expect(body.getByRole("link", { name: "Safe documentation" })).toHaveAttribute("href", "https://example.com/docs");
  await expect(body.getByRole("img", { name: "Architecture diagram" })).toHaveAttribute("src", "https://images.example.test/architecture.png");
  await expect(body.locator("pre.shiki")).toBeVisible();
  await expect(body.locator("script, style, [data-hostile], [onerror], [onclick]")).toHaveCount(0);
  await expect(body.getByText("Unsafe destination")).not.toHaveAttribute("href", /^(?:javascript|data):/i);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${webOrigin}/posts/${slugs.published}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const articleBox = await page.getByRole("article").boundingBox();
  expect(articleBox).not.toBeNull();
  expect(articleBox!.x).toBeGreaterThanOrEqual(0);
  expect(articleBox!.x + articleBox!.width).toBeLessThanOrEqual(390);
  expect(await body.locator("pre").evaluate((element) => element.scrollWidth >= element.clientWidth)).toBe(true);
  expect(await body.locator("table").evaluate((element) => element.scrollWidth >= element.clientWidth)).toBe(true);

  const unavailableBodies: string[] = [];
  for (const slug of [slugs.draft, slugs.unpublished, slugs.deleted, `unknown-${suffix}`]) {
    const response = await page.goto(`${webOrigin}/posts/${slug}`);
    expect(response?.status()).toBe(404);
    unavailableBodies.push((await page.locator("body").innerText()).replace(/\s+/g, " ").trim());
  }
  expect(new Set(unavailableBodies).size).toBe(1);
});
