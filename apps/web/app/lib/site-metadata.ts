import type { PublicDistribution } from "@blog-x/contracts";
import type { Metadata } from "next";

const disallowedXmlControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function publicOrigin(value = process.env.PUBLIC_ORIGIN, production = process.env.NODE_ENV === "production") {
  if (!value) {
    if (production) throw new Error("PUBLIC_ORIGIN is required in production");
    return new URL("http://127.0.0.1:3100");
  }

  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("PUBLIC_ORIGIN must be an absolute HTTP(S) origin");
  }
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("PUBLIC_ORIGIN must be an absolute HTTP(S) origin without credentials, path, query, or fragment");
  }
  return new URL(origin.origin);
}

export function publicUrl(path: string, origin = publicOrigin()) {
  if (!path.startsWith("/")) throw new Error("public URL paths must begin with /");
  return new URL(path, origin).toString();
}

type SearchParameters = Record<string, string | string[] | undefined>;

export type CanonicalPage = {
  canonical?: string;
  index: boolean;
};

export function resolveCanonicalPage(path: string, searchParams: SearchParameters, totalPages: number, origin = publicOrigin()): CanonicalPage {
  const keys = Object.keys(searchParams);
  if (keys.length === 0 || (keys.length === 1 && keys[0] === "page" && searchParams.page === undefined)) {
    return { canonical: publicUrl(path, origin), index: true };
  }
  if (keys.length !== 1 || keys[0] !== "page" || typeof searchParams.page !== "string") return { index: false };
  const page = searchParams.page;
  if (page === "1") return { canonical: publicUrl(path, origin), index: true };
  if (!/^[1-9]\d*$/.test(page) || page.startsWith("0")) return { index: false };
  const number = Number(page);
  if (!Number.isSafeInteger(number) || number < 2 || number > totalPages) return { index: false };
  return { canonical: publicUrl(`${path}?page=${page}`, origin), index: true };
}

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  type?: "article" | "website";
  origin?: URL;
  index?: boolean;
};

export function pageMetadata({ title, description, path, type = "website", origin = publicOrigin(), index = true }: PageMetadataOptions): Metadata {
  const url = publicUrl(path, origin);
  return {
    title,
    description,
    ...(index ? { alternates: { canonical: url, types: { "application/rss+xml": "/rss.xml" } } } : { robots: { index: false, follow: true } }),
    openGraph: { title, description, type, url, siteName: "Blog X" },
  };
}

export function escapeXml(value: string) {
  return value.replace(disallowedXmlControls, "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

export function renderRss(distribution: PublicDistribution, origin = publicOrigin()) {
  const site = origin.toString();
  const items = distribution.articles.slice(0, 20).map((article) => {
    const permalink = publicUrl(`/posts/${encodeURIComponent(article.slug)}`, origin);
    return [
      "<item>",
      `<title>${escapeXml(article.title)}</title>`,
      `<link>${escapeXml(permalink)}</link>`,
      `<guid isPermaLink=\"true\">${escapeXml(permalink)}</guid>`,
      `<description>${escapeXml(article.summary)}</description>`,
      `<pubDate>${escapeXml(new Date(article.publishedAt).toUTCString())}</pubDate>`,
      "</item>",
    ].join("");
  }).join("");
  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>Blog X</title><link>${escapeXml(site)}</link><description>个人技术博客</description>${items}</channel></rss>`;
}
