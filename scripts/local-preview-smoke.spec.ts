import { expect, test } from "@playwright/test";

const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";

test("fast local preview serves health and a responsive public home without page errors", async ({ page, request }) => {
  const health = await request.get(`${webOrigin}/api/health`);
  expect(health.status()).toBe(200);
  expect(health.headers()["cache-control"]).toBe("no-store");
  await expect(health.json()).resolves.toEqual({ ok: true });

  const publicSettings = await request.get(`${webOrigin}/api/public/site-settings`);
  expect(publicSettings.status()).toBe(200);
  expect(publicSettings.headers()["cache-control"]).toBe("public, max-age=30");
  const credentialBearingSettings = await request.get(`${webOrigin}/api/public/site-settings`, { headers: { cookie: "preview=harmless" } });
  expect(credentialBearingSettings.status()).toBe(200);
  expect(credentialBearingSettings.headers()["cache-control"]).toBe("no-store");
  const invalidPublic = await request.get(`${webOrigin}/api/public/articles?page=invalid`);
  expect(invalidPublic.status()).toBe(400);
  expect(invalidPublic.headers()["cache-control"]).toBe("no-store");
  const unknown = await request.get(`${webOrigin}/api/unknown-preview-route`);
  expect(unknown.status()).toBe(404);
  expect(unknown.headers()["cache-control"]).toBe("no-store");
  const rss = await request.get(`${webOrigin}/rss.xml`);
  expect(rss.status()).toBe(200);
  expect(rss.headers()["cache-control"]).toBe("public, max-age=30");

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    const response = await page.goto(`${webOrigin}/`, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("public-header")).toBeVisible();
    await expect(page.locator("#main-content")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  expect(pageErrors).toEqual([]);
});
