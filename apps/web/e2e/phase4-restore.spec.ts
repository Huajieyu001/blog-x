import { expect, test } from "@playwright/test";

const webOrigin = process.env.E2E_RESTORE_WEB_ORIGIN;
const publishedSlug = process.env.E2E_RESTORE_PUBLISHED_SLUG;
const publishedTitle = process.env.E2E_RESTORE_PUBLISHED_TITLE;
const mediaId = process.env.E2E_RESTORE_MEDIA_ID;
const hiddenSlugs = (process.env.E2E_RESTORE_HIDDEN_SLUGS ?? "").split(",").filter(Boolean);
const phase5LegacyArticleId = process.env.PHASE5_LEGACY_ARTICLE_ID;
const phase5LegacyArticleSlug = process.env.PHASE5_LEGACY_ARTICLE_SLUG;

if (!webOrigin || !publishedSlug || !publishedTitle || !mediaId || hiddenSlugs.length < 4) {
  throw new Error("managed Phase 4 restore origin and fixture identities are required");
}
if (new URL(webOrigin).origin !== webOrigin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(webOrigin)) {
  throw new Error("E2E_RESTORE_WEB_ORIGIN must be the exact generated loopback Web origin");
}
if (Boolean(phase5LegacyArticleId) !== Boolean(phase5LegacyArticleSlug)) {
  throw new Error("Phase 5 restored legacy identity requires both ID and slug");
}

test("restored published article and media remain same-origin while non-public states remain unavailable", async ({ page, request }) => {
  const imageRequests: string[] = [];
  page.on("request", (event) => { if (event.resourceType() === "image") imageRequests.push(event.url()); });
  const homepage = await page.goto(webOrigin);
  expect(homepage?.headers()["content-security-policy"]).toContain("img-src 'self'");
  await expect(page.getByRole("link", { name: publishedTitle, exact: true })).toBeVisible();
  const article = await page.goto(`${webOrigin}/posts/${publishedSlug}`);
  expect(article?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: publishedTitle })).toBeVisible();
  await expect(page.locator(`img[src="/media/${mediaId}"]`).first()).toHaveAttribute("alt", "恢复演练封面");
  const media = await request.get(`${webOrigin}/media/${mediaId}`);
  expect(media.status()).toBe(200);
  expect(media.headers()["content-type"]).toContain("image/png");
  expect((await media.body()).byteLength).toBeGreaterThan(0);
  for (const slug of hiddenSlugs) expect((await request.get(`${webOrigin}/api/public/articles/${slug}`)).status()).toBe(404);
  if (phase5LegacyArticleSlug) {
    const legacy = await page.goto(`${webOrigin}/posts/${phase5LegacyArticleSlug}`);
    expect(legacy?.status()).toBe(200);
    const legacyBody = page.getByTestId("article-body");
    await expect(page.getByRole("heading", { level: 1, name: "遗留媒体复原文章" })).toBeVisible();
    await expect(legacyBody.getByRole("link", { name: "外部文档" })).toHaveAttribute("href", "https://docs.example.test/legacy");
    await expect(legacyBody.locator("img[src]")).toHaveCount(0);
  }
  expect(imageRequests.length).toBeGreaterThan(0);
  for (const requestUrl of imageRequests) {
    const url = new URL(requestUrl);
    expect(url.origin).toBe(webOrigin);
    expect(url.pathname).toMatch(/^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  }
});
