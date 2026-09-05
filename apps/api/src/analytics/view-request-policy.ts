import type { AnonymousViewSource } from "@blog-x/contracts";

type AnonymousViewRequestHeaders = {
  origin?: string;
  purpose?: string;
  secPurpose?: string;
  nextRouterPrefetch?: string;
  referer?: string;
  userAgent?: string;
};

export type AnonymousViewDecision = { accepted: false } | { accepted: true; source: AnonymousViewSource };

export const anonymousViewCrawlerTokens = Object.freeze([
  "googlebot", "bingbot", "baiduspider", "duckduckbot", "yandexbot", "slurp",
  "facebookexternalhit", "twitterbot", "linkedinbot", "applebot",
] as const);

export const anonymousViewSearchRoots = Object.freeze([
  "baidu.com", "bing.com", "duckduckgo.com", "google.com", "sogou.com", "so.com", "yahoo.com",
] as const);

export const anonymousViewSocialRoots = Object.freeze([
  "bilibili.com", "douban.com", "facebook.com", "linkedin.com", "reddit.com", "t.co", "twitter.com",
  "weibo.com", "weixin.qq.com", "x.com", "zhihu.com",
] as const);

function isExactPublicOrigin(origin: string | undefined, publicOrigin: string) {
  if (!origin || origin !== publicOrigin) return false;
  try {
    const normalized = new URL(publicOrigin);
    return /^https?:$/.test(normalized.protocol) && normalized.origin === publicOrigin;
  } catch {
    return false;
  }
}

function hasAutomationPurpose(value: string | undefined) {
  return value !== undefined && /(?:^|[\s,;])(?:prefetch|prerender)(?:$|[\s,;])/i.test(value);
}

function isTruthyPrefetch(value: string | undefined) {
  if (value === undefined) return false;
  const normalized = value.trim().toLocaleLowerCase("en-US");
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

function isKnownCrawler(value: string | undefined) {
  const normalized = value?.toLocaleLowerCase("en-US") ?? "";
  return anonymousViewCrawlerTokens.some((token) => normalized.includes(token));
}

function matchesRoot(host: string, roots: readonly string[]) {
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

function classifySource(referer: string | undefined, publicOrigin: string): AnonymousViewSource {
  if (!referer) return "direct";
  let parsed: URL;
  try {
    parsed = new URL(referer);
  } catch {
    return "direct";
  }
  if (!/^https?:$/.test(parsed.protocol)) return "direct";
  if (parsed.origin === publicOrigin) return "internal";
  if (matchesRoot(parsed.hostname, anonymousViewSearchRoots)) return "search";
  if (matchesRoot(parsed.hostname, anonymousViewSocialRoots)) return "social";
  return "external";
}

/** Inspects transient request metadata and returns only a fixed source enum or ignore. */
export function classifyAnonymousViewRequest(headers: AnonymousViewRequestHeaders, publicOrigin: string): AnonymousViewDecision {
  if (!isExactPublicOrigin(headers.origin, publicOrigin)) return { accepted: false };
  if (hasAutomationPurpose(headers.purpose) || hasAutomationPurpose(headers.secPurpose) || isTruthyPrefetch(headers.nextRouterPrefetch)) return { accepted: false };
  if (isKnownCrawler(headers.userAgent)) return { accepted: false };
  return { accepted: true, source: classifySource(headers.referer, publicOrigin) };
}
