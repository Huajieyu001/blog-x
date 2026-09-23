import { defaultSiteSettings, type PublicDistribution, type PublicSiteSettings } from "@blog-x/contracts";
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
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("public URL paths must be same-origin root-relative paths");
  }
  const resolved = new URL(path, origin);
  if (resolved.origin !== origin.origin) {
    throw new Error("public URL paths must stay on PUBLIC_ORIGIN");
  }
  return resolved.toString();
}

type PublicBlogPostingInput = {
  title: string;
  summary: string;
  slug: string;
  publishedAt: string;
};

type PublicSiteIdentity = Pick<PublicSiteSettings, "name" | "description">;

export function buildBlogPosting({ title, summary, slug, publishedAt }: PublicBlogPostingInput, origin = publicOrigin(), site: PublicSiteIdentity = defaultSiteSettings) {
  const canonical = publicUrl(`/posts/${encodeURIComponent(slug)}`, origin);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: summary,
    datePublished: publishedAt,
    publisher: {
      "@type": "Organization",
      name: site.name,
      description: site.description,
    },
    mainEntityOfPage: canonical,
    url: canonical,
  };
}

export function serializeJsonLd(value: ReturnType<typeof buildBlogPosting>) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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
  canonicalPath?: string | null;
  site?: PublicSiteIdentity;
};

export function pageMetadata({
  title,
  description,
  path,
  type = "website",
  origin = publicOrigin(),
  index = true,
  canonicalPath,
  site = defaultSiteSettings,
}: PageMetadataOptions): Metadata {
  const url = publicUrl(path, origin);
  const resolvedCanonicalPath = canonicalPath === undefined ? (index ? path : null) : canonicalPath;
  return {
    title,
    description,
    ...(resolvedCanonicalPath !== null ? {
      alternates: {
        canonical: publicUrl(resolvedCanonicalPath, origin),
        ...(index ? { types: { "application/rss+xml": "/rss.xml" } } : {}),
      },
    } : {}),
    ...(!index ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, type, url, siteName: site.name },
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

export function renderRss(distribution: PublicDistribution, site: PublicSiteIdentity = defaultSiteSettings, origin = publicOrigin()) {
  const siteUrl = origin.toString();
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
  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>${escapeXml(site.name)}</title><link>${escapeXml(siteUrl)}</link><description>${escapeXml(site.description)}</description>${items}</channel></rss>`;
}
