import type { MetadataRoute } from "next";
import { publicUrl } from "./lib/site-metadata";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/login", "/api"] },
    sitemap: publicUrl("/sitemap.xml"),
  };
}
