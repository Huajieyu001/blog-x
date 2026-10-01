import {
  adminPostListSchema,
  adminPostSchema,
  publicPostListResponseSchema,
  publicTaxonomyListSchema,
  publicTaxonomyPostListSchema,
  sessionStatusSchema,
  taxonomyListSchema,
  type AdminPost,
  type PublicPostListResponse,
  type SessionStatus,
  type TaxonomyTerm,
  publicAboutSchema,
  archiveSchema,
  type AdminAbout,
  adminAboutSchema,
  publicPostDetailSchema,
  publicPostNotFoundResponseSchema,
  type PublicPostDetail,
  publicDistributionSchema,
  type PublicDistribution,
  publicSearchResponseSchema,
  type PublicSearchResponse,
  publicRelatedPostsResponseSchema,
  type PublicRelatedPostsResponse,
  auditEventListSchema,
  type AuditEventList,
  adminAnalyticsResponseSchema,
  type AdminAnalytics,
  deletedPostListSchema,
  type DeletedPost,
  publicSiteSettingsSchema,
  type PublicSiteSettings,
  adminSiteSettingsSchema,
  type AdminSiteSettings,
  articleRevisionListSchema,
  type ArticleRevisionSummary,
} from "@blog-x/contracts";
import { unstable_cache } from "next/cache";
import { cache } from "react";

const internalApiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";
const internalApiTimeoutMs = 4_000;
/** Shared API and render-cache horizon for anonymous, validated public content. */
export const publicRevalidationSeconds = 30;
const publicDataCacheOptions = { revalidate: publicRevalidationSeconds } as const;

type Parser<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } };
export type PublicResult<T> = { kind: "ok"; data: T } | { kind: "not_found" } | { kind: "upstream_error" };
export type PublicPostResult = PublicResult<PublicPostDetail> | { kind: "redirect"; location: string };
export type AdminResult<T> = { kind: "ok"; data: T } | { kind: "upstream_error" };
export type AdminOptionalResult<T> = AdminResult<T> | { kind: "not_found" };
export type SessionStatusResult = { kind: "ok"; data: SessionStatus } | { kind: "unauthorized" } | { kind: "upstream_error" };

/** Bounded, per-request fetch for Web server reads from the internal API. */
export function internalApiFetch(path: string, init: RequestInit = {}, timeoutMs = internalApiTimeoutMs): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  return fetch(`${internalApiOrigin}${path}`, { ...init, signal });
}

async function getPublic<T>(path: string, schema: Parser<T>, allowNotFound = false): Promise<PublicResult<T>> {
  try {
    const response = await internalApiFetch(path, { cache: "no-store" });
    if (response.status === 404) {
      const missing = publicPostNotFoundResponseSchema.safeParse(await response.json());
      return allowNotFound && missing.success ? { kind: "not_found" } : { kind: "upstream_error" };
    }
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch {
    return { kind: "upstream_error" };
  }
}

type CacheablePublicFailure = "not_found" | "upstream_error";

class CacheablePublicReadError extends Error {
  constructor(readonly result: CacheablePublicFailure) {
    super(result);
  }
}

function cacheableFailure<T>(error: unknown): PublicResult<T> {
  return error instanceof CacheablePublicReadError && error.result === "not_found"
    ? { kind: "not_found" }
    : { kind: "upstream_error" };
}

/**
 * Keep the HTTP fetch itself no-store. Next's fetch cache is HTTP-status
 * agnostic, so the Next data cache is intentionally applied only after a
 * successful response has passed its runtime contract schema.
 */
async function readCacheablePublic<T>(path: string, schema: Parser<T>, allowNotFound = false): Promise<T> {
  try {
    const response = await internalApiFetch(path, { cache: "no-store" });
    if (response.status === 404) {
      const missing = publicPostNotFoundResponseSchema.safeParse(await response.json());
      throw new CacheablePublicReadError(allowNotFound && missing.success ? "not_found" : "upstream_error");
    }
    if (!response.ok) throw new CacheablePublicReadError("upstream_error");
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new CacheablePublicReadError("upstream_error");
    return parsed.data;
  } catch (error) {
    if (error instanceof CacheablePublicReadError) throw error;
    throw new CacheablePublicReadError("upstream_error");
  }
}

export async function getSessionStatus(cookieHeader: string): Promise<SessionStatusResult> {
  try {
    const response = await internalApiFetch("/auth/session", {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (response.status === 401) return { kind: "unauthorized" };
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = sessionStatusSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch {
    return { kind: "upstream_error" };
  }
}

export async function getAdminAboutResult(cookieHeader: string): Promise<AdminOptionalResult<AdminAbout>> {
  try {
    const response = await internalApiFetch("/admin/about", { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = adminAboutSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch { return { kind: "upstream_error" }; }
}

const readCachedPublicAbout = unstable_cache(
  () => readCacheablePublic("/public/about", publicAboutSchema, true),
  ["blog-x", "public-about"],
  publicDataCacheOptions,
);
const readCachedPublicSiteSettings = unstable_cache(
  () => readCacheablePublic("/public/site-settings", publicSiteSettingsSchema),
  ["blog-x", "public-site-settings"],
  publicDataCacheOptions,
);
const readCachedArchives = unstable_cache(
  () => readCacheablePublic("/public/archives", archiveSchema),
  ["blog-x", "public-archives"],
  publicDataCacheOptions,
);
const readCachedPublicDistribution = unstable_cache(
  () => readCacheablePublic("/public/distribution", publicDistributionSchema),
  ["blog-x", "public-distribution"],
  publicDataCacheOptions,
);
const readCachedPublicCategories = unstable_cache(
  () => readCacheablePublic("/public/categories", publicTaxonomyListSchema),
  ["blog-x", "public-categories"],
  publicDataCacheOptions,
);
const readCachedPublicTags = unstable_cache(
  () => readCacheablePublic("/public/tags", publicTaxonomyListSchema),
  ["blog-x", "public-tags"],
  publicDataCacheOptions,
);
const cachedPublicAbout = cache(async () => {
  try { return { kind: "ok" as const, data: await readCachedPublicAbout() }; } catch (error) { return cacheableFailure<Awaited<ReturnType<typeof readCachedPublicAbout>>>(error); }
});
const cachedPublicSiteSettings = cache(async () => {
  try { return { kind: "ok" as const, data: await readCachedPublicSiteSettings() }; } catch (error) { return cacheableFailure<Awaited<ReturnType<typeof readCachedPublicSiteSettings>>>(error); }
});
const cachedArchives = cache(async () => {
  try { return { kind: "ok" as const, data: await readCachedArchives() }; } catch (error) { return cacheableFailure<Awaited<ReturnType<typeof readCachedArchives>>>(error); }
});
const cachedPublicDistribution = cache(async () => {
  try { return { kind: "ok" as const, data: await readCachedPublicDistribution() }; } catch (error) { return cacheableFailure<Awaited<ReturnType<typeof readCachedPublicDistribution>>>(error); }
});
const cachedPublicTaxonomy = cache(async (kind: "categories" | "tags") => {
  try {
    const reader = kind === "categories" ? readCachedPublicCategories : readCachedPublicTags;
    return { kind: "ok" as const, data: await reader() };
  } catch (error) {
    return cacheableFailure<Awaited<ReturnType<typeof readCachedPublicCategories>>>(error);
  }
});
const cachedPublicPosts = cache((page: number) => getPublic(`/public/articles?page=${encodeURIComponent(String(page))}`, publicPostListResponseSchema));
const readCachedPublicRelatedPosts = unstable_cache(
  (slug: string) => readCacheablePublic(`/public/articles/${encodeURIComponent(slug)}/related`, publicRelatedPostsResponseSchema),
  ["blog-x", "public-related-posts"],
  publicDataCacheOptions,
);
const cachedPublicRelatedPosts = cache(async (slug: string) => {
  try { return { kind: "ok" as const, data: await readCachedPublicRelatedPosts(slug) }; } catch (error) { return cacheableFailure<Awaited<ReturnType<typeof readCachedPublicRelatedPosts>>>(error); }
});
function redirectLocation(location: string | null) {
  // The API is an upstream boundary. Never allow an absolute URL, a query,
  // traversal, or a differently-shaped API route to become browser navigation.
  const match = /^\/public\/articles\/([A-Za-z0-9][A-Za-z0-9-]*)$/.exec(location ?? "");
  if (!match) return null;
  try {
    const slug = decodeURIComponent(match[1]);
    return slug === match[1] ? `/posts/${encodeURIComponent(slug)}` : null;
  } catch { return null; }
}

async function readCacheablePublicPost(slug: string): Promise<Extract<PublicPostResult, { kind: "ok" | "redirect" }>> {
  try {
    const response = await internalApiFetch(`/public/articles/${encodeURIComponent(slug)}`, { cache: "no-store", redirect: "manual" });
    if (response.status === 308) {
      const location = redirectLocation(response.headers.get("location"));
      if (location) return { kind: "redirect", location };
      throw new CacheablePublicReadError("upstream_error");
    }
    if (response.status === 404) {
      const missing = publicPostNotFoundResponseSchema.safeParse(await response.json());
      throw new CacheablePublicReadError(missing.success ? "not_found" : "upstream_error");
    }
    if (!response.ok) throw new CacheablePublicReadError("upstream_error");
    const parsed = publicPostDetailSchema.safeParse(await response.json());
    if (!parsed.success) throw new CacheablePublicReadError("upstream_error");
    return { kind: "ok", data: parsed.data };
  } catch (error) {
    if (error instanceof CacheablePublicReadError) throw error;
    throw new CacheablePublicReadError("upstream_error");
  }
}
const readCachedPublicPost = unstable_cache(
  readCacheablePublicPost,
  ["blog-x", "public-post"],
  publicDataCacheOptions,
);
const cachedPublicPost = cache(async (slug: string): Promise<PublicPostResult> => {
  try { return await readCachedPublicPost(slug); } catch (error) { return cacheableFailure<PublicPostDetail>(error); }
});
const cachedPublicTaxonomyPosts = cache((kind: "categories" | "tags", slug: string, page: number) => getPublic(`/public/${kind}/${encodeURIComponent(slug)}/articles?page=${encodeURIComponent(String(page))}`, publicTaxonomyPostListSchema, true));

/** React.cache keeps repeated public reads within one RSC render request to one API call. */
export function getPublicAbout() { return cachedPublicAbout(); }

export function getPublicSiteSettings(): Promise<PublicResult<PublicSiteSettings>> {
  return cachedPublicSiteSettings();
}

export async function getAdminSiteSettingsResult(cookieHeader: string): Promise<AdminOptionalResult<AdminSiteSettings>> {
  try {
    const response = await internalApiFetch("/admin/site-settings", { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = adminSiteSettingsSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch { return { kind: "upstream_error" }; }
}

export function getArchives() { return cachedArchives(); }

export async function getAdminPostResult(id: string, cookieHeader: string): Promise<AdminOptionalResult<AdminPost>> {
  try {
    const response = await internalApiFetch(`/admin/posts/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = adminPostSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch {
    return { kind: "upstream_error" };
  }
}

export async function getAdminRevisionListResult(id: string, cookieHeader: string): Promise<AdminResult<ArticleRevisionSummary[]>> {
  try {
    const response = await internalApiFetch(`/admin/posts/${encodeURIComponent(id)}/revisions`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = articleRevisionListSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch {
    return { kind: "upstream_error" };
  }
}

export async function getAdminPosts(cookieHeader: string): Promise<AdminPost[]> {
  try {
    const response = await internalApiFetch("/admin/posts", {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) return [];
    const parsed = adminPostListSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function getAdminPostsResult(cookieHeader: string): Promise<AdminResult<AdminPost[]>> {
  try {
    const response = await internalApiFetch("/admin/posts", {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = adminPostListSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch {
    return { kind: "upstream_error" };
  }
}

export async function getAdminDeletedPostsResult(cookieHeader: string): Promise<AdminResult<DeletedPost[]>> {
  try {
    const response = await internalApiFetch("/admin/deleted-posts", { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = deletedPostListSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch { return { kind: "upstream_error" }; }
}

export async function getAdminAnalytics(
  cookieHeader: string,
  range: AdminAnalytics["range"],
  limit: number,
): Promise<AdminResult<AdminAnalytics>> {
  const query = new URLSearchParams({ range: String(range), limit: String(limit) });
  try {
    const response = await internalApiFetch(`/admin/analytics?${query.toString()}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = adminAnalyticsResponseSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch {
    return { kind: "upstream_error" };
  }
}

export async function getAdminAuditEventsResult(cookieHeader: string, cursor?: string): Promise<AdminResult<AuditEventList>> {
  try {
    const search = new URLSearchParams({ limit: "25" });
    if (cursor) search.set("cursor", cursor);
    const response = await internalApiFetch(`/admin/audit-events?${search.toString()}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = auditEventListSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch {
    return { kind: "upstream_error" };
  }
}

export async function getAdminTaxonomyResult(
  kind: "categories" | "tags",
  cookieHeader: string,
): Promise<AdminResult<TaxonomyTerm[]>> {
  try {
    const response = await internalApiFetch(`/admin/${kind}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = taxonomyListSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data.items } : { kind: "upstream_error" };
  } catch {
    return { kind: "upstream_error" };
  }
}

export function getPublicPosts(page: number): Promise<PublicResult<PublicPostListResponse>> {
  return cachedPublicPosts(page);
}

export function getPublicPost(slug: string): Promise<PublicPostResult> {
  return cachedPublicPost(slug);
}

export function getPublicDistribution(): Promise<PublicResult<PublicDistribution>> {
  return cachedPublicDistribution();
}

export function getPublicTaxonomy(kind: "categories" | "tags") {
  return cachedPublicTaxonomy(kind);
}

export function getPublicTaxonomyPosts(kind: "categories" | "tags", slug: string, page: number) {
  return cachedPublicTaxonomyPosts(kind, slug, page);
}

export function getPublicSearch(query: string, page: number): Promise<PublicResult<PublicSearchResponse>> {
  const search = new URLSearchParams({ q: query, page: String(page) });
  return getPublic(`/public/search?${search.toString()}`, publicSearchResponseSchema);
}

export function getPublicRelatedPosts(slug: string): Promise<PublicResult<PublicRelatedPostsResponse>> {
  return cachedPublicRelatedPosts(slug);
}
