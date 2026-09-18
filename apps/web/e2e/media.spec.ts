import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

function requiredRunnerFact(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required from the generated Phase 15 media fixture`);
  return value;
}

const username = requiredRunnerFact("E2E_ADMIN_USERNAME");
const password = requiredRunnerFact("E2E_ADMIN_PASSWORD");
const runId = requiredRunnerFact("E2E_RUN_ID");
const webOrigin = requiredRunnerFact("E2E_WEB_ORIGIN");

function crc32(value: Buffer) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(width: number, height: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) row.set([45, 94, 82, 255], 1 + x * 4);
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("administrator uploads, reuses, protects, and safely deletes responsive media through the library", async ({ page, context }) => {
  test.setTimeout(180_000);

  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  const slug = `media-${runId}`;
  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(`媒体文章 ${runId}`);
  await page.getByLabel("Slug").fill(slug);
  const source = page.getByLabel("Markdown");
  await source.fill("# 媒体文章\n\n正文开始。\n");

  const fileInput = page.getByLabel("上传图片（JPEG、PNG 或 WebP，最大 5 MiB）");
  await fileInput.setInputFiles({ name: "wide-source.png", mimeType: "image/png", buffer: png(120, 40) });
  await page.getByRole("button", { name: "上传图片", exact: true }).click();
  const uploadStatus = page.locator("#media-upload-status");
  await expect(uploadStatus).toHaveText("图片已上传，可插入文章或设为封面。");
  await expect(uploadStatus).toBeFocused();
  await page.getByRole("button", { name: "插入 Markdown" }).click();
  await expect(page.getByText("请填写图片替代文本，或明确标记为装饰图片。")).toBeVisible();
  await expect(source).not.toHaveValue(/\/media\//);

  await page.getByTestId("media-alt-text").fill("宽幅架构图");
  await page.getByRole("button", { name: "插入 Markdown" }).click();
  await expect(source).toHaveValue(/!\[宽幅架构图\]\(\/media\/[0-9a-f-]{36}\)/);
  const purposefulUrl = (await source.inputValue()).match(/\((\/media\/[0-9a-f-]{36})\)/)?.[1];
  expect(purposefulUrl).toBeTruthy();
  await page.getByRole("button", { name: "设为封面" }).click();
  await expect(page.getByText(`当前封面：${purposefulUrl}`)).toBeVisible();

  const retained = await source.inputValue();
  await fileInput.setInputFiles({ name: "hostile.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg onload='alert(1)'/>") });
  await expect(uploadStatus).toHaveText("图片未选择：仅支持 JPEG、PNG 或 WebP 格式。");
  await expect(page.getByRole("button", { name: "上传图片", exact: true })).toBeDisabled();
  await expect(source).toHaveValue(retained);

  await fileInput.setInputFiles({ name: "decoration.png", mimeType: "image/png", buffer: png(24, 24) });
  await page.getByLabel("这是装饰图片").check();
  await expect(page.getByTestId("media-alt-text")).toBeDisabled();
  await page.getByRole("button", { name: "上传图片", exact: true }).click();
  await expect(uploadStatus).toHaveText("图片已上传，可插入文章或设为封面。");
  await expect(uploadStatus).toBeFocused();
  await page.getByRole("button", { name: "插入 Markdown" }).click();
  await expect(source).toHaveValue(/!\[\]\(\/media\/[0-9a-f-]{36}\)/);

  await fileInput.setInputFiles({ name: "unused.png", mimeType: "image/png", buffer: png(24, 24) });
  await page.getByLabel("这是装饰图片").uncheck();
  await page.getByTestId("media-alt-text").fill("待清理媒体");
  await page.getByRole("button", { name: "上传图片", exact: true }).click();
  await expect(uploadStatus).toHaveText("图片已上传，可插入文章或设为封面。");
  const unusedUrl = await page.locator("figure img").getAttribute("src");
  expect(unusedUrl).toMatch(/^\/media\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("草稿已保存");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();
  const editorUrl = page.url();

  await page.goto(`${webOrigin}/posts/${slug}`);
  const cover = page.locator(`img[src="${purposefulUrl}"][width="120"][height="40"]`);
  await expect(cover).toHaveAttribute("alt", "宽幅架构图");
  const body = page.getByTestId("article-body");
  await expect(body.locator(`img[src="${purposefulUrl}"]`)).toHaveAttribute("alt", "宽幅架构图");
  await expect(body.locator('img[alt=""]')).toHaveCount(1);
  const mediaResponse = await context.request.get(`${webOrigin}${purposefulUrl}`);
  expect(mediaResponse.status()).toBe(200);
  expect(mediaResponse.headers()["content-type"]).toMatch(/^image\/png/);
  expect(mediaResponse.headers()["x-content-type-options"]).toBe("nosniff");

  await page.goto(`${webOrigin}/admin/media`);
  await expect(page.getByRole("heading", { name: "媒体库" })).toBeVisible();
  const library = page.getByRole("list", { name: "媒体目录" });
  const purposefulId = purposefulUrl!.slice("/media/".length);
  await page.getByLabel("按媒体 ID 搜索").fill(purposefulId);
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(library).toContainText("被 1 篇内容引用");
  await expect(library.getByRole("button", { name: "删除媒体" })).toHaveCount(0);

  await page.goto(editorUrl);
  const selectLibrary = page.getByLabel("可复用媒体");
  await selectLibrary.getByLabel("按媒体 ID 搜索").fill(purposefulId);
  await selectLibrary.getByRole("button", { name: "搜索" }).click();
  await selectLibrary.getByRole("button", { name: "选择" }).click();
  await expect(uploadStatus).toHaveText("已选择已有图片；请为这次使用填写替代文本，或标记为装饰图片。", { timeout: 10_000 });
  await page.getByTestId("media-alt-text").fill("复用的宽幅架构图");
  await page.getByRole("button", { name: "插入 Markdown" }).click();
  await expect(source).toHaveValue(/!\[复用的宽幅架构图\]\(\/media\/[0-9a-f-]{36}\)/);
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status", { name: "编辑器状态" })).toHaveText("更改已保存");

  await page.goto(`${webOrigin}/admin/media`);
  const deleteLibrary = page.getByRole("list", { name: "媒体目录" });
  const unusedId = unusedUrl!.slice("/media/".length);
  await page.getByLabel("按媒体 ID 搜索").fill(unusedId);
  await page.getByRole("button", { name: "搜索" }).click();
  const deleteButton = deleteLibrary.getByRole("button", { name: "删除媒体" });
  await expect(deleteLibrary).toContainText("未被内容引用");
  await deleteButton.click();
  const deleteDialog = deleteLibrary.getByRole("dialog");
  await expect(deleteDialog).toContainText("删除后文件不可恢复");
  await page.keyboard.press("Escape");
  await expect(deleteButton).toBeFocused();
  await deleteButton.click();
  await deleteDialog.getByRole("button", { name: "确认永久删除" }).click();
  await expect(deleteLibrary.getByRole("status")).toHaveText("媒体已永久删除。");
  await expect(deleteLibrary).not.toContainText(unusedId);
  expect((await context.request.get(`${webOrigin}${unusedUrl}`)).status()).toBe(404);

  await page.goto(`${webOrigin}/admin/audit`);
  const audit = page.getByLabel("管理员操作记录");
  await expect(audit.getByText("删除未引用媒体").first()).toBeVisible();
  await expect(audit).toContainText(unusedId);
  await expect(audit).not.toContainText("source/");
  await expect(audit).not.toContainText("derivative/");

  for (const viewport of [{ width: 390, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${webOrigin}/admin/media`);
    const box = await page.getByRole("heading", { name: "媒体库" }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const search = page.getByLabel("按媒体 ID 搜索");
    expect((await search.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});
