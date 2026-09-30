import { expect, test } from "@playwright/test";

const webOrigin = process.env.E2E_WEB_ORIGIN ?? "http://127.0.0.1:3100";

test("fast local preview serves health and a responsive public home without page errors", async ({ page, request }) => {
  const health = await request.get(`${webOrigin}/api/health`);
  expect(health.status()).toBe(200);
  await expect(health.json()).resolves.toEqual({ ok: true });

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
