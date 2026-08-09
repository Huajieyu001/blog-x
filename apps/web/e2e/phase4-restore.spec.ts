import { expect, test } from "@playwright/test";

const webOrigin = process.env.E2E_RESTORE_WEB_ORIGIN;
const publishedSlug = process.env.E2E_RESTORE_PUBLISHED_SLUG;
const publishedTitle = process.env.E2E_RESTORE_PUBLISHED_TITLE;
const mediaId = process.env.E2E_RESTORE_MEDIA_ID;
const hiddenSlugs = (process.env.E2E_RESTORE_HIDDEN_SLUGS ?? "").split(",").filter(Boolean);

if (!webOrigin || !publishedSlug || !publishedTitle || !mediaId || hiddenSlugs.length < 4) {
  throw new Error("managed Phase 4 restore origin and fixture identities are required");
}
if (new URL(webOrigin).origin !== webOrigin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(webOrigin)) {
  throw new Error("E2E_RESTORE_WEB_ORIGIN must be the exact generated loopback Web origin");
}

test("restored published article and media remain same-origin while non-public states remain unavailable", async ({ page, request }) => {
  const origins = new Set<string>();
  page.on("request", (event) => { if (/^https?:/.test(event.url())) origins.add(new URL(event.url()).origin); });
  await page.goto(webOrigin);
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
  expect(origins).toEqual(new Set([webOrigin]));
});
