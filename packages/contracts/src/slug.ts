import { z } from "zod";

/**
 * The canonical slug grammar for values an author can create. Keep route
 * consumers on this grammar as well: published content may legitimately use
 * Unicode letters or uppercase characters.
 */
export const authorableSlugPattern = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

export const authorableSlugSchema = z.string()
  .trim()
  .min(1, "请输入 Slug")
  .max(180, "Slug 不能超过 180 个字符")
  .regex(authorableSlugPattern, "Slug 只能包含字母、数字和单个连字符");

const publicArticleLocationPrefix = "/public/articles/";

/** Encode an API article location exactly once from an already authorable slug. */
export function publicArticleLocationForSlug(slug: string) {
  return `${publicArticleLocationPrefix}${encodeURIComponent(authorableSlugSchema.parse(slug))}`;
}

/**
 * Parse only canonical API-owned article locations. Canonical re-encoding
 * rejects raw Unicode, double encoding, separators/traversal, query/hash, and
 * external URLs while still admitting all authorable Unicode and uppercase
 * slugs.
 */
export function parsePublicArticleLocation(location: string) {
  if (!location.startsWith(publicArticleLocationPrefix)) return null;
  const encodedSlug = location.slice(publicArticleLocationPrefix.length);
  if (!encodedSlug || /[/?#]/.test(encodedSlug)) return null;
  try {
    const slug = decodeURIComponent(encodedSlug);
    const parsed = authorableSlugSchema.safeParse(slug);
    if (encodeURIComponent(slug) !== encodedSlug || !parsed.success || parsed.data !== slug) return null;
    return slug;
  } catch {
    return null;
  }
}

export const publicArticleRedirectLocationSchema = z.string().refine(
  (location) => parsePublicArticleLocation(location) !== null,
  "location must be a canonical root-relative public article route",
);

/** Translate a validated upstream API route to its Web route without re-encoding it. */
export function publicPostPathForRedirectLocation(location: string) {
  return parsePublicArticleLocation(location) === null
    ? null
    : `/posts/${location.slice(publicArticleLocationPrefix.length)}`;
}
