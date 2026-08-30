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

test("administrator publishes Markdown that is immediately SSR-readable", async ({ page, request }) => {
  const slug = `walking-skeleton-${runId}`;
  const title = `Walking skeleton ${slug}`;
  await page.setExtraHTTPHeaders({ "cache-control": "no-cache", pragma: "no-cache" });
  await page.goto(webOrigin);
  await page.getByRole("link", { name: "管理" }).click();
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/login"));
  await page.getByRole("button", { name: "登录" }).click();
  await expect((await loginResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "文章管理" })).toBeVisible();
  await page.getByRole("link", { name: "新建草稿" }).click();
  await page.getByLabel("标题").fill(title);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Markdown").fill("# Hello\n\n| A | B |\n| - | - |\n| 1 | 2 |");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.getByRole("button", { name: "发布" }).click();
  await expect.poll(async () => {
    const response = await request.get(`${webOrigin}/api/public/articles?page=1`);
    return ((await response.json()) as { items: Array<{ slug: string }> }).items.some((item) => item.slug === slug);
  }).toBe(true);
  await page.goto(webOrigin);
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible();
});
