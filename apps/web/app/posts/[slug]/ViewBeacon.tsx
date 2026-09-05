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
    const controller = new AbortController();
    let completed = false;
    void fetch(`/api/public/articles/${encodeURIComponent(slug)}/view`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => undefined).finally(() => { completed = true; });
    return () => {
      if (!completed) controller.abort();
    };
  }, [slug]);

  return null;
}
