import { expect, test, type Page } from "@playwright/test";

function requiredRunnerFact(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required from the generated main-browser fixture`);
  return value;
}

const username = requiredRunnerFact("E2E_ADMIN_USERNAME");
const password = requiredRunnerFact("E2E_ADMIN_PASSWORD");
const webOrigin = requiredRunnerFact("E2E_WEB_ORIGIN");

async function login(page: Page) {
  await page.goto(`${webOrigin}/admin`);
  if (page.url().endsWith("/login")) {
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录" }).click();
  }
  await expect(page).toHaveURL(`${webOrigin}/admin`);
}

test("administrator analytics uses same-origin SSR navigation with strict ranges and permanent privacy copy", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "查看完整统计 →" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin/analytics?range=30`);
  await expect(page.getByRole("heading", { name: "访问统计" })).toBeVisible();
  await expect(page.getByText("这里展示的是按 Asia/Shanghai 自然日汇总的匿名页面浏览量（PV）。")).toBeVisible();
  await expect(page.getByRole("link", { name: "30 天" })).toHaveAttribute("aria-current", "page");
  for (const range of ["7 天", "90 天", "400 天"]) await expect(page.getByRole("link", { name: range })).toBeVisible();
  await page.getByRole("link", { name: "7 天" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin/analytics?range=7`);
});

test("invalid analytics range never reaches an analytics API request and offers exact recovery", async ({ page }) => {
  await login(page);
  let analyticsRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/admin/analytics")) analyticsRequests += 1; });
  await page.goto(`${webOrigin}/admin/analytics?range=30&range=7`);
  await expect(page.getByRole("heading", { name: "时间范围无效" })).toBeVisible();
  await expect(page.getByText("请选择 7、30、90 或 400 天。", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "查看 30 天" })).toHaveAttribute("href", "/admin/analytics?range=30");
  expect(analyticsRequests).toBe(0);
});

test("dashboard keeps its authoring hierarchy and visible static actions", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  for (const heading of ["内容概况", "继续创作", "最近 30 天访问", "文章管理", "站点维护"]) await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByRole("link", { name: "新建草稿" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /导出 Markdown/ })).toBeVisible();
});
