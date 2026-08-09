import type { PublicDistribution } from "@blog-x/contracts";

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
