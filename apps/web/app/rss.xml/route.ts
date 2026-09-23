import { defaultSiteSettings } from "@blog-x/contracts";
import { getPublicDistribution, getPublicSiteSettings } from "../lib/api";
import { renderRss } from "../lib/site-metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  const [distribution, siteResult] = await Promise.all([getPublicDistribution(), getPublicSiteSettings()]);
  if (distribution.kind !== "ok") throw new Error("public distribution unavailable");
  const site = siteResult.kind === "ok" ? siteResult.data : defaultSiteSettings;
  return new Response(renderRss(distribution.data, site), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
