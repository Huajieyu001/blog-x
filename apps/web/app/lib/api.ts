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
} from "@blog-x/contracts";

const internalApiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";

type Parser<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } };
export type PublicResult<T> = { kind: "ok"; data: T } | { kind: "not_found" } | { kind: "upstream_error" };

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

export async function getAdminAbout(cookieHeader: string): Promise<AdminAbout | null> {
  try {
    const response = await fetch(`${internalApiOrigin}/admin/about`, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
    if (!response.ok) return null;
    const parsed = adminAboutSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function getPublicAbout() { return getPublic("/public/about", publicAboutSchema, true); }

export function getArchives() { return getPublic("/public/archives", archiveSchema); }

export async function getAdminPost(id: string, cookieHeader: string): Promise<AdminPost | null> {
  try {
    const response = await fetch(`${internalApiOrigin}/admin/posts/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) return null;
    const parsed = adminPostSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
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

export async function getAdminTaxonomy(
  kind: "categories" | "tags",
  cookieHeader: string,
): Promise<TaxonomyTerm[]> {
  try {
    const response = await fetch(`${internalApiOrigin}/admin/${kind}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!response.ok) return [];
    const parsed = taxonomyListSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}

export function getPublicPosts(page: number): Promise<PublicResult<PublicPostListResponse>> {
  return getPublic(`/public/articles?page=${encodeURIComponent(String(page))}`, publicPostListResponseSchema);
}

export function getPublicPost(slug: string): Promise<PublicResult<PublicPostDetail>> {
  return getPublic(`/public/articles/${encodeURIComponent(slug)}`, publicPostDetailSchema, true);
}

export function getPublicDistribution(): Promise<PublicResult<PublicDistribution>> {
  return getPublic("/public/distribution", publicDistributionSchema);
}

export function getPublicTaxonomy(kind: "categories" | "tags") {
  return getPublic(`/public/${kind}`, publicTaxonomyListSchema);
}

export function getPublicTaxonomyPosts(kind: "categories" | "tags", slug: string, page: number) {
  return getPublic(`/public/${kind}/${encodeURIComponent(slug)}/articles?page=${encodeURIComponent(String(page))}`, publicTaxonomyPostListSchema, true);
}
