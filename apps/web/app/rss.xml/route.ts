import { getPublicDistribution } from "../lib/api";
import { renderRss } from "../lib/site-metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  const distribution = await getPublicDistribution();
  if (distribution.kind !== "ok") throw new Error("public distribution unavailable");
  return new Response(renderRss(distribution.data), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
