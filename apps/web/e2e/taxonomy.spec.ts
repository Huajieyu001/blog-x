import { expect, test } from "@playwright/test";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";

test("taxonomy discovery pages preserve their public navigation", async ({ page }) => {
  await page.goto("/");
  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "分类", exact: true })).toBeVisible();
  await page.goto("/tags");
  await expect(page.getByRole("heading", { name: "标签", exact: true })).toBeVisible();
});

test("administrator manages taxonomy and assigns it through visible controls", async ({ page }) => {
  test.skip(!username || !password, "E2E administrator credentials are required");
  const runId = process.env.E2E_RUN_ID ?? String(Date.now());
  const categoryName = `分类 ${runId}`;
  const editedCategoryName = `${categoryName} 已编辑`;
  const categorySlug = `category-${runId}`;
  const tagName = `标签 ${runId}`;
  const tagSlug = `tag-${runId}`;

  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username!);
  await page.getByLabel("密码").fill(password!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);
  await page.goto(`${webOrigin}/admin/taxonomy`);

  const categories = page.getByRole("region", { name: "分类管理" });
  await categories.getByLabel("名称").fill(categoryName);
  await categories.getByLabel("Slug").fill(categorySlug);
  await categories.getByRole("button", { name: "创建分类" }).click();
  await expect(categories.getByTestId("taxonomy-status")).toHaveText("分类已创建。");
  const categoryRow = categories.getByRole("listitem").filter({ hasText: categorySlug });
  const editCategory = categoryRow.getByRole("button", { name: `编辑${categoryName}` });
  await editCategory.click();
  await expect(categories.getByRole("heading", { name: "编辑分类" })).toBeVisible();
  await expect(categories.getByLabel("名称")).toHaveValue(categoryName);
  await categories.getByLabel("名称").fill("不会保存的分类名");
  await categories.getByRole("button", { name: "取消编辑" }).click();
  await expect(editCategory).toBeFocused();
  await expect(categoryRow).toContainText(categoryName);

  await editCategory.click();
  await categories.getByLabel("名称").fill(editedCategoryName);
  await categories.getByRole("button", { name: "保存更改" }).click();
  await expect(categories.getByTestId("taxonomy-status")).toHaveText("分类已更新。");
  const editedRow = categories.getByRole("listitem").filter({ hasText: categorySlug });
  await expect(editedRow).toContainText(editedCategoryName);
  await expect(editedRow.getByRole("button", { name: `编辑${editedCategoryName}` })).toBeFocused();

  const tags = page.getByRole("region", { name: "标签管理" });
  await tags.getByLabel("名称").fill(tagName);
  await tags.getByLabel("Slug").fill(tagSlug);
  await tags.getByRole("button", { name: "创建标签" }).click();
  await expect(tags.getByTestId("taxonomy-status")).toHaveText("标签已创建。");

  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(`Taxonomy article ${runId}`);
  await page.getByLabel("Slug").fill(`taxonomy-article-${runId}`);
  await page.getByLabel("Markdown").fill("# Taxonomy assignment");
  await page.getByLabel("分类").selectOption({ label: editedCategoryName });
  await page.getByRole("checkbox", { name: tagName }).check();
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");

  await page.goto(`${webOrigin}/admin/taxonomy`);
  const associatedCategory = page.getByRole("region", { name: "分类管理" }).getByRole("listitem").filter({ hasText: categorySlug });
  await expect(associatedCategory).toContainText("关联文章 1 篇");
  await expect(associatedCategory.getByRole("button", { name: "删除" })).toBeDisabled();
  await expect(associatedCategory).toContainText("请先移除或重新分配关联文章，才能删除。");
});
