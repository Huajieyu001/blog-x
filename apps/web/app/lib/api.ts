import { sessionStatusSchema, type SessionStatus } from "@blog-x/contracts";

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
