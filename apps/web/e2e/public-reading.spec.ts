import { expect, test, type Page } from "@playwright/test";

function requiredRunnerFact(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required from the generated main-browser fixture`);
  return value;
}

const username = requiredRunnerFact("E2E_ADMIN_USERNAME");
const password = requiredRunnerFact("E2E_ADMIN_PASSWORD");
const runId = requiredRunnerFact("E2E_RUN_ID");
const webOrigin = requiredRunnerFact("E2E_WEB_ORIGIN");

async function createDraft(page: Page, input: { title: string; summary: string; slug: string; markdown: string; category?: string }) {
  await page.goto(`${webOrigin}/admin/new`);
  await page.getByLabel("标题").fill(input.title);
  await page.getByLabel("摘要").fill(input.summary);
  await page.getByLabel("Slug").fill(input.slug);
  if (input.category) await page.getByLabel("分类").selectOption({ label: input.category });
  await page.getByLabel("Markdown").fill(input.markdown);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]+$/);
  return page.url();
}

test("published permalink is a safe focused technical reading surface and every unavailable state is one 404", async ({ page, browser }) => {
  test.setTimeout(120_000);

  await page.goto(`${webOrigin}/login`);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  const suffix = runId;
  const slugs = {
    published: `technical-reading-${suffix}`,
    related: `related-reading-${suffix}`,
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
    "```ts",
    "const intentionallyLongValue = 'abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz';",
    "console.log(intentionallyLongValue);",
    "```",
    "",
    "```bash",
    "printf 'second fenced block'",
    "```",
    "",
    ...Array.from({ length: 28 }, (_, index) => `Progress reading paragraph ${index + 1}: a deliberately retained line of technical context keeps this public article longer than one viewport.`),
    "",
    "<script data-hostile=\"true\">window.hostile = true</script>",
    "<style>body { display: none }</style>",
    "[Unsafe destination](javascript:alert(1))",
  ].join("\n");

  const publishedTitle = `A focused technical article ${runId}`;
  const categoryName = `Reading category ${runId}`;
  const categorySlug = `reading-category-${runId}`;
  await page.goto(`${webOrigin}/admin/taxonomy`);
  const categories = page.getByRole("region", { name: "分类管理" });
  await categories.getByLabel("名称").fill(categoryName);
  await categories.getByLabel("Slug").fill(categorySlug);
  await categories.getByRole("button", { name: "创建分类" }).click();
  await expect(categories.getByRole("status")).toHaveText("分类已创建。");

  await createDraft(page, { title: publishedTitle, summary: "A concise introduction to the reading surface.", slug: slugs.published, markdown, category: categoryName });
  const editorPreview = page.getByTestId("markdown-preview");
  await expect(editorPreview.locator("pre")).toHaveCount(2);
  await expect(editorPreview.getByRole("button", { name: /复制代码块/ })).toHaveCount(0);
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();

  const relatedTitle = `A related technical article ${runId}`;
  await createDraft(page, { title: relatedTitle, summary: "A related article for retained route navigation.", slug: slugs.related, markdown: "# Related reading", category: categoryName });
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("状态：已发布")).toBeVisible();

  await createDraft(page, { title: `Draft secret ${runId}`, summary: "hidden", slug: slugs.draft, markdown: "# Draft secret" });
  await createDraft(page, { title: `Unpublished secret ${runId}`, summary: "hidden", slug: slugs.unpublished, markdown: "# Unpublished secret" });
  await page.getByRole("button", { name: "发布" }).click();
  await page.getByRole("button", { name: "下线" }).click();
  await createDraft(page, { title: `Deleted secret ${runId}`, summary: "hidden", slug: slugs.deleted, markdown: "# Deleted secret" });
  await page.getByRole("button", { name: "发布" }).click();
  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("dialog", { name: "确认软删除文章" }).getByRole("button", { name: "确认软删除" }).click();
  await expect(page).toHaveURL(`${webOrigin}/admin`);

  const beaconPath = (slug: string) => `/api/public/articles/${encodeURIComponent(slug)}/view`;
  const beaconPaths = new Map(Object.values(slugs).map((slug) => [beaconPath(slug), slug]));
  const beacons: Array<{ slug: string; method: string; url: string; headers: Record<string, string>; body: string | null }> = [];
  page.on("request", (request) => {
    const slug = beaconPaths.get(new URL(request.url()).pathname);
    if (!slug) return;
    beacons.push({ slug, method: request.method(), url: request.url(), headers: request.headers(), body: request.postData() });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  const firstBeaconPath = beaconPath(slugs.published);
  const firstBeaconStarted = page.waitForRequest((request) => request.url() === `${webOrigin}${firstBeaconPath}` && request.method() === "POST");
  const firstBeaconResponsePromise = page.waitForResponse((response) => response.url() === `${webOrigin}${firstBeaconPath}` && response.request().method() === "POST");
  const publishedResponse = await page.goto(`${webOrigin}/posts/${slugs.published}`);
  expect(publishedResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: publishedTitle })).toBeVisible();
  await expect(page.getByText("A concise introduction to the reading surface.")).toBeVisible();
  const primaryArticle = page.getByRole("article", { name: publishedTitle });
  const readingProgress = page.getByRole("progressbar", { name: "阅读进度" });
  await expect(readingProgress).toHaveCount(1);
  await expect(readingProgress).toBeVisible();
  await expect(readingProgress).toHaveAttribute("aria-valuemin", "0");
  await expect(readingProgress).toHaveAttribute("aria-valuemax", "100");
  await expect(readingProgress).not.toHaveAttribute("aria-live");
  await expect(readingProgress).not.toHaveAttribute("tabindex");
  const initialReadingProgress = Number(await readingProgress.getAttribute("aria-valuenow"));
  expect(initialReadingProgress).toBeGreaterThanOrEqual(0);
  expect(initialReadingProgress).toBeLessThanOrEqual(100);
  expect(await readingProgress.evaluate((element) => {
    (element as HTMLElement).focus();
    return document.activeElement === element;
  })).toBe(false);
  await primaryArticle.evaluate((article) => {
    const top = window.scrollY + article.getBoundingClientRect().top;
    window.scrollTo({ top: top + article.getBoundingClientRect().height - window.innerHeight });
  });
  await expect.poll(async () => Number(await readingProgress.getAttribute("aria-valuenow"))).toBe(100);
  const primaryPublishedTime = primaryArticle.locator(":scope > header time");
  await expect(primaryPublishedTime).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  const script = page.locator('script[type="application/ld+json"]');
  await expect(script).toHaveCount(1);
  const posting = JSON.parse(await script.textContent() ?? "");
  expect(Object.keys(posting)).toEqual(["@context", "@type", "headline", "description", "datePublished", "mainEntityOfPage", "url"]);
  expect(posting.headline).toBe(publishedTitle);
  expect(posting.description).toBe("A concise introduction to the reading surface.");
  expect(posting.datePublished).toBe(await primaryPublishedTime.getAttribute("datetime"));
  const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(posting.mainEntityOfPage).toBe(canonicalHref);
  expect(posting.url).toBe(canonicalHref);
  expect(canonicalHref).toBeTruthy();
  const copyButton = page.getByRole("button", { name: "复制文章链接", exact: true });
  const copyStatus = page.getByRole("status", { name: "复制文章链接状态" });
  await expect(copyButton).toHaveCount(1);
  await expect(copyStatus).toHaveCount(1);
  const body = page.getByTestId("article-body");
  const codeCopyButtons = body.getByRole("button", { name: /^复制代码块 [12]$/ });
  const codeCopyStatuses = body.getByRole("status", { name: /^代码块 [12] 复制状态$/ });
  await expect(body.locator("[data-code-copy-block]")).toHaveCount(2);
  await expect(codeCopyButtons).toHaveCount(2);
  await expect(codeCopyStatuses).toHaveCount(2);
  const codeTexts = await body.locator("pre").evaluateAll((blocks) => blocks.map((block) => block.textContent ?? ""));
  expect(codeTexts).toHaveLength(2);
  await codeCopyButtons.first().focus();
  const desktopCodeCopyButton = await codeCopyButtons.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, focusVisible: element.matches(":focus-visible"), outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  expect(desktopCodeCopyButton.height).toBeGreaterThanOrEqual(44);
  expect(desktopCodeCopyButton.focusVisible).toBe(true);
  expect(desktopCodeCopyButton.outlineStyle).not.toBe("none");
  expect(desktopCodeCopyButton.outlineWidth).toBeGreaterThanOrEqual(2);
  await copyButton.focus();
  const copyButtonFocus = await copyButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(copyButtonFocus.height).toBeGreaterThanOrEqual(44);
  expect(copyButtonFocus.focusVisible).toBe(true);
  expect(copyButtonFocus.outlineStyle).not.toBe("none");
  expect(copyButtonFocus.outlineWidth).toBeGreaterThanOrEqual(2);

  await page.evaluate(() => {
    const view = window as typeof window & {
      copyArticleLinkClipboardDescriptor?: PropertyDescriptor;
      copyArticleLinkExecCommand?: typeof Document.prototype.execCommand;
      copyArticleLinkCalls?: string[];
      copyArticleLinkFallbacks?: string[];
    };
    view.copyArticleLinkClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    view.copyArticleLinkExecCommand = Document.prototype.execCommand;
    view.copyArticleLinkCalls = [];
    view.copyArticleLinkFallbacks = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(value: string) {
          view.copyArticleLinkCalls?.push(value);
          return Promise.resolve();
        },
      },
    });
  });
  await copyButton.click();
  await expect(copyStatus).toHaveText("文章链接已复制。");
  expect(await page.evaluate(() => (window as typeof window & { copyArticleLinkCalls?: string[] }).copyArticleLinkCalls)).toEqual([canonicalHref]);
  await codeCopyButtons.nth(1).click();
  await expect(codeCopyStatuses.nth(1)).toHaveText("代码已复制。");
  expect(await page.evaluate(() => (window as typeof window & { copyArticleLinkCalls?: string[] }).copyArticleLinkCalls)).toEqual([canonicalHref, codeTexts[1]]);

  await page.evaluate(() => {
    const view = window as typeof window & { copyArticleLinkFallbacks?: string[] };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("clipboard denied")) },
    });
    Document.prototype.execCommand = (command) => {
      view.copyArticleLinkFallbacks?.push(document.querySelector<HTMLTextAreaElement>("[data-clipboard-fallback]")?.value ?? "");
      return command === "copy";
    };
  });
  await copyButton.click();
  await expect(copyStatus).toHaveText("文章链接已复制。");
  expect(await page.evaluate(() => (window as typeof window & { copyArticleLinkFallbacks?: string[] }).copyArticleLinkFallbacks)).toEqual([canonicalHref]);
  await expect(page.locator("[data-clipboard-fallback]")).toHaveCount(0);
  await codeCopyButtons.first().click();
  await expect(codeCopyStatuses.first()).toHaveText("代码已复制。");
  expect(await page.evaluate(() => (window as typeof window & { copyArticleLinkFallbacks?: string[] }).copyArticleLinkFallbacks)).toEqual([canonicalHref, codeTexts[0]]);
  await expect(page.locator("[data-clipboard-fallback]")).toHaveCount(0);

  await page.evaluate(() => {
    Document.prototype.execCommand = () => false;
  });
  await copyButton.click();
  await expect(copyStatus).toHaveText("复制失败，请手动复制浏览器地址栏中的链接。");
  await expect(page.locator("[data-clipboard-fallback]")).toHaveCount(0);
  await codeCopyButtons.first().click();
  await expect(codeCopyStatuses.first()).toHaveText("复制失败，请手动选择代码并复制。");
  await expect(page.locator("[data-clipboard-fallback]")).toHaveCount(0);

  await page.evaluate(() => {
    Document.prototype.execCommand = () => {
      throw new Error("copy unavailable");
    };
  });
  await copyButton.click();
  await expect(copyStatus).toHaveText("复制失败，请手动复制浏览器地址栏中的链接。");
  await expect(page.locator("[data-clipboard-fallback]")).toHaveCount(0);
  await codeCopyButtons.nth(1).click();
  await expect(codeCopyStatuses.nth(1)).toHaveText("复制失败，请手动选择代码并复制。");
  await expect(page.locator("[data-clipboard-fallback]")).toHaveCount(0);
  await page.evaluate(() => {
    const view = window as typeof window & {
      copyArticleLinkClipboardDescriptor?: PropertyDescriptor;
      copyArticleLinkExecCommand?: typeof Document.prototype.execCommand;
      copyArticleLinkCalls?: string[];
      copyArticleLinkFallbacks?: string[];
    };
    if (view.copyArticleLinkClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", view.copyArticleLinkClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
    if (view.copyArticleLinkExecCommand) Document.prototype.execCommand = view.copyArticleLinkExecCommand;
    delete view.copyArticleLinkClipboardDescriptor;
    delete view.copyArticleLinkExecCommand;
    delete view.copyArticleLinkCalls;
    delete view.copyArticleLinkFallbacks;
  });
  await page.goto(`${webOrigin}/about`);
  await expect(page.locator("[data-code-copy-block], [data-clipboard-fallback]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /复制代码块/ })).toHaveCount(0);
  await page.goto(`${webOrigin}/posts/${slugs.published}`);
  await expect(body.locator("[data-code-copy-block]")).toHaveCount(2);
  await expect(body.getByRole("heading", { level: 2, name: "Reliable rendering" })).toBeVisible();
  await expect(body.locator("blockquote")).toBeVisible();
  await expect(body.locator("table")).toBeVisible();
  await expect(body.getByRole("link", { name: "Safe documentation" })).toHaveAttribute("href", "https://example.com/docs");
  await expect(body.locator("pre.shiki")).toHaveCount(2);
  await expect(body.locator("pre.shiki").first()).toBeVisible();
  await expect(body.locator("pre.shiki").last()).toBeVisible();
  await expect(body.locator("script, style, [data-hostile], [onerror], [onclick]")).toHaveCount(0);
  await expect(body.getByText("Unsafe destination")).not.toHaveAttribute("href", /^(?:javascript|data):/i);
  await expect.poll(() => beacons.length).toBe(2);
  await firstBeaconStarted;
  expect(beacons[0]).toMatchObject({ slug: slugs.published, method: "POST", url: `${webOrigin}${firstBeaconPath}`, body: "{}" });
  await expect(page.locator("[data-testid='view-beacon']")).toHaveCount(0);

  const relatedLink = page.getByRole("link", { name: relatedTitle, exact: true });
  await expect(relatedLink).toHaveAttribute("href", `/posts/${slugs.related}`);
  const relatedBeaconPath = beaconPath(slugs.related);
  const relatedBeaconResponsePromise = page.waitForResponse((response) => response.url() === `${webOrigin}${relatedBeaconPath}` && response.request().method() === "POST");
  // Navigate as soon as the first beacon has begun. The retained slug set
  // must prevent duplicates without aborting the in-flight anonymous event.
  await relatedLink.click();
  await expect(page).toHaveURL(`${webOrigin}/posts/${slugs.related}`);
  await expect(page.getByRole("heading", { level: 1, name: relatedTitle })).toBeVisible();
  await expect.poll(() => beacons.filter((beacon) => beacon.slug === slugs.related).length).toBe(1);
  expect(beacons.filter((beacon) => beacon.slug === slugs.published)).toHaveLength(2);
  const firstBeaconResponse = await firstBeaconResponsePromise;
  const firstBeaconHeaders = await firstBeaconResponse.request().allHeaders();
  expect(firstBeaconHeaders.cookie).toBeUndefined();
  expect(firstBeaconHeaders.authorization).toBeUndefined();
  expect(firstBeaconHeaders.origin).toBe(webOrigin);
  expect(firstBeaconResponse.status()).toBe(204);
  expect(firstBeaconResponse.headers()["cache-control"]).toBe("no-store");
  expect(firstBeaconResponse.headers()["content-length"]).toBeUndefined();
  const relatedBeaconResponse = await relatedBeaconResponsePromise;
  expect(relatedBeaconResponse.status()).toBe(204);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${webOrigin}/posts/${slugs.published}`);
  await expect.poll(() => beacons.filter((beacon) => beacon.slug === slugs.published).length).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(copyButton).toBeVisible();
  expect(await copyButton.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const copyButtonBox = await copyButton.boundingBox();
  expect(copyButtonBox).not.toBeNull();
  expect(copyButtonBox!.x).toBeGreaterThanOrEqual(0);
  expect(copyButtonBox!.x + copyButtonBox!.width).toBeLessThanOrEqual(390);
  const articleBox = await primaryArticle.boundingBox();
  expect(articleBox).not.toBeNull();
  expect(articleBox!.x).toBeGreaterThanOrEqual(0);
  expect(articleBox!.x + articleBox!.width).toBeLessThanOrEqual(390);
  const narrowReadingProgress = page.getByRole("progressbar", { name: "阅读进度" });
  await expect(narrowReadingProgress).toHaveCount(1);
  await expect(narrowReadingProgress).toBeVisible();
  const narrowReadingProgressBox = await narrowReadingProgress.boundingBox();
  expect(narrowReadingProgressBox).not.toBeNull();
  expect(narrowReadingProgressBox!.x).toBeGreaterThanOrEqual(0);
  expect(narrowReadingProgressBox!.x + narrowReadingProgressBox!.width).toBeLessThanOrEqual(390);
  const narrowCodeCopyButtons = body.getByRole("button", { name: /^复制代码块 [12]$/ });
  await expect(narrowCodeCopyButtons).toHaveCount(2);
  await narrowCodeCopyButtons.first().focus();
  const narrowCodeCopyButton = await narrowCodeCopyButtons.first().evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return { height: box.height, x: box.x, right: box.right, focusVisible: element.matches(":focus-visible"), outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  expect(narrowCodeCopyButton.height).toBeGreaterThanOrEqual(44);
  expect(narrowCodeCopyButton.x).toBeGreaterThanOrEqual(0);
  expect(narrowCodeCopyButton.right).toBeLessThanOrEqual(390);
  expect(narrowCodeCopyButton.focusVisible).toBe(true);
  expect(narrowCodeCopyButton.outlineStyle).not.toBe("none");
  expect(narrowCodeCopyButton.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(await body.locator("pre").first().evaluate((element) => element.scrollWidth >= element.clientWidth)).toBe(true);
  expect(await body.locator("table").evaluate((element) => element.scrollWidth >= element.clientWidth)).toBe(true);

  await page.emulateMedia({ media: "print" });
  await expect(narrowReadingProgress).toBeHidden();
  await expect(body.getByRole("heading", { level: 2, name: "Reliable rendering" })).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const noJsPage = await noJsContext.newPage();
    await noJsPage.goto(`${webOrigin}/posts/${slugs.published}`);
    await expect(noJsPage.getByRole("progressbar", { name: "阅读进度" })).toBeHidden();
    await expect(noJsPage.getByRole("heading", { level: 1, name: publishedTitle })).toBeVisible();
    await expect(noJsPage.getByTestId("article-body").getByRole("heading", { level: 2, name: "Reliable rendering" })).toBeVisible();
  } finally {
    await noJsContext.close();
  }

  const unavailableBodies: string[] = [];
  for (const slug of [slugs.draft, slugs.unpublished, slugs.deleted, `unknown-${suffix}`]) {
    const response = await page.goto(`${webOrigin}/posts/${slug}`);
    expect(response?.status()).toBe(404);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    unavailableBodies.push((await page.locator("body").innerText()).replace(/\s+/g, " ").trim());
  }
  expect(beacons).toHaveLength(4);
  expect(new Set(unavailableBodies).size).toBe(1);
});
