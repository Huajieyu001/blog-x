import type { Pool, PoolClient } from "pg";
import { classifyArticleMedia, type LegacyMediaReview } from "../content/media-reference-policy.js";

type Queryable = Pick<Pool | PoolClient, "query">;

type RetainedArticle = {
  id: string;
  markdown: string;
  cover_url: string;
  cover_media_id: string | null;
  legacy_media_review: LegacyMediaReview;
};

/**
 * Dispositions retained source under the caller's migration lock. This is
 * intentionally database-only: it neither fetches URLs nor changes Markdown.
 */
export async function classifyRetainedLegacyMedia(client: Queryable) {
  const rows = await client.query<RetainedArticle>([
    "select id, markdown, cover_url, cover_media_id, legacy_media_review",
    "from articles where deleted_at is null for update",
  ].join(" "));

  let changed = 0;
  for (const article of rows.rows) {
    const classification = classifyArticleMedia({ markdown: article.markdown, coverUrl: article.cover_url });
    const clearHistoricCover = classification.invalidCoverUrl && article.cover_media_id !== null;
    const coverUrl = clearHistoricCover ? "" : article.cover_url;
    const legacyMediaReview: LegacyMediaReview = classification.invalidMarkdownSources.length
      || (classification.invalidCoverUrl && !clearHistoricCover)
      ? "review_required"
      : "clear";
    if (article.legacy_media_review === legacyMediaReview && article.cover_url === coverUrl) continue;
    await client.query(
      "update articles set legacy_media_review = $2, cover_url = $3 where id = $1",
      [article.id, legacyMediaReview, coverUrl],
    );
    changed += 1;
  }
  return { scanned: rows.rowCount ?? 0, changed };
}
