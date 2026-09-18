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
import { cache } from "react";

const internalApiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";

type Parser<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } };
export type PublicResult<T> = { kind: "ok"; data: T } | { kind: "not_found" } | { kind: "upstream_error" };
export type PublicPostResult = PublicResult<PublicPostDetail> | { kind: "redirect"; location: string };
export type AdminResult<T> = { kind: "ok"; data: T } | { kind: "upstream_error" };
export type AdminOptionalResult<T> = AdminResult<T> | { kind: "not_found" };

async function getPublic<T>(path: string, schema: Parser<T>, allowNotFound = false): Promise<PublicResult<T>> {
  try {
    const response = await fetch(`${internalApiOrigin}${path}`, { cache: "no-store" });
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

export async function getSessionStatus(cookieHeader: string): Promise<SessionStatus | null> {
  try {
    const response = await fetch(`${internalApiOrigin}/auth/session`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) return null;
    const parsed = sessionStatusSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getAdminAboutResult(cookieHeader: string): Promise<AdminOptionalResult<AdminAbout>> {
  try {
    const response = await fetch(`${internalApiOrigin}/admin/about`, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = adminAboutSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch { return { kind: "upstream_error" }; }
}

const cachedPublicAbout = cache(() => getPublic("/public/about", publicAboutSchema, true));
const cachedPublicSiteSettings = cache(() => getPublic("/public/site-settings", publicSiteSettingsSchema));
const cachedPublicPosts = cache((page: number) => getPublic(`/public/articles?page=${encodeURIComponent(String(page))}`, publicPostListResponseSchema));
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

const cachedPublicPost = cache(async (slug: string): Promise<PublicPostResult> => {
  try {
    const response = await fetch(`${internalApiOrigin}/public/articles/${encodeURIComponent(slug)}`, { cache: "no-store", redirect: "manual" });
    if (response.status === 308) {
      const location = redirectLocation(response.headers.get("location"));
      return location ? { kind: "redirect", location } : { kind: "upstream_error" };
    }
    if (response.status === 404) {
      const missing = publicPostNotFoundResponseSchema.safeParse(await response.json());
      return missing.success ? { kind: "not_found" } : { kind: "upstream_error" };
    }
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = publicPostDetailSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch { return { kind: "upstream_error" }; }
});
const cachedPublicTaxonomyPosts = cache((kind: "categories" | "tags", slug: string, page: number) => getPublic(`/public/${kind}/${encodeURIComponent(slug)}/articles?page=${encodeURIComponent(String(page))}`, publicTaxonomyPostListSchema, true));

/** React.cache keeps repeated public reads within one RSC render request to one API call. */
export function getPublicAbout() { return cachedPublicAbout(); }

export function getPublicSiteSettings(): Promise<PublicResult<PublicSiteSettings>> {
  return cachedPublicSiteSettings();
}

export async function getAdminSiteSettingsResult(cookieHeader: string): Promise<AdminOptionalResult<AdminSiteSettings>> {
  try {
    const response = await fetch(`${internalApiOrigin}/admin/site-settings`, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "upstream_error" };
    const parsed = adminSiteSettingsSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "upstream_error" };
  } catch { return { kind: "upstream_error" }; }
}

export function getArchives() { return getPublic("/public/archives", archiveSchema); }

export async function getAdminPostResult(id: string, cookieHeader: string): Promise<AdminOptionalResult<AdminPost>> {
  try {
    const response = await fetch(`${internalApiOrigin}/admin/posts/${encodeURIComponent(id)}`, {
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
    const response = await fetch(`${internalApiOrigin}/admin/posts/${encodeURIComponent(id)}/revisions`, {
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
    const response = await fetch(`${internalApiOrigin}/admin/posts`, {
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
    const response = await fetch(`${internalApiOrigin}/admin/posts`, {
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
    const response = await fetch(`${internalApiOrigin}/admin/deleted-posts`, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
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
    const response = await fetch(`${internalApiOrigin}/admin/analytics?${query.toString()}`, {
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
    const response = await fetch(`${internalApiOrigin}/admin/audit-events?${search.toString()}`, {
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
    const response = await fetch(`${internalApiOrigin}/admin/${kind}`, {
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
  return getPublic("/public/distribution", publicDistributionSchema);
}

export function getPublicTaxonomy(kind: "categories" | "tags") {
  return getPublic(`/public/${kind}`, publicTaxonomyListSchema);
}

export function getPublicTaxonomyPosts(kind: "categories" | "tags", slug: string, page: number) {
  return cachedPublicTaxonomyPosts(kind, slug, page);
}

export function getPublicSearch(query: string, page: number): Promise<PublicResult<PublicSearchResponse>> {
  const search = new URLSearchParams({ q: query, page: String(page) });
  return getPublic(`/public/search?${search.toString()}`, publicSearchResponseSchema);
}

export function getPublicRelatedPosts(slug: string): Promise<PublicResult<PublicRelatedPostsResponse>> {
  return getPublic(`/public/articles/${encodeURIComponent(slug)}/related`, publicRelatedPostsResponseSchema);
}
