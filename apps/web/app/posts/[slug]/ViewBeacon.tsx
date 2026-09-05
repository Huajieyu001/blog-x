"use client";

import { useEffect, useRef } from "react";

/**
 * Deliberately renders nothing: successful public detail hydration is the only
 * signal needed to record one anonymous aggregate page open.
 */
export default function ViewBeacon({ slug }: { slug: string }) {
  const sentSlugs = useRef(new Set<string>());

  useEffect(() => {
    if (sentSlugs.current.has(slug)) return;
    sentSlugs.current.add(slug);
    // This is intentionally fire-and-forget. React development Strict Mode
    // replays effects; aborting the first request would suppress the replay
    // because the slug is already retained in the ref-backed set.
    void fetch(`/api/public/articles/${encodeURIComponent(slug)}/view`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      credentials: "omit",
      cache: "no-store",
    }).catch(() => undefined);
  }, [slug]);

  return null;
}
