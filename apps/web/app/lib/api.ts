import {
  adminPostListSchema,
  adminPostSchema,
  publicPostListResponseSchema,
  sessionStatusSchema,
  type AdminPost,
  type PublicPostListResponse,
  type SessionStatus,
} from "@blog-x/contracts";

const internalApiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";

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

export async function getPublicPosts(page: number): Promise<PublicPostListResponse | null> {
  try {
    const response = await fetch(`${internalApiOrigin}/public/articles?page=${encodeURIComponent(String(page))}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const parsed = publicPostListResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
