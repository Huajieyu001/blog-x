import { adminAnalyticsResponseSchema, anonymousViewSourceValues, type AdminAnalytics } from "@blog-x/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { publicPredicate } from "./public-repository.js";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;
type AnalyticsOptions = { range: 7 | 30 | 90 | 400; limit: number };

function nonNegativeSafeInteger(value: unknown, field: string) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`analytics ${field} is not a non-negative safe integer`);
  return parsed;
}

function rows(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`analytics ${field} is malformed`);
  return value;
}

export function createAdminAnalyticsRepository(db: Database) {
  async function read({ range, limit }: AnalyticsOptions): Promise<AdminAnalytics> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '2000ms'`);
      const result = await tx.execute(sql`
        WITH bounds AS (
          SELECT
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AS to_day,
            ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date - ${range - 1})::date AS from_day
        ), eligible AS (
          SELECT views."article_id", views."day", views."total_pv", views."direct_pv", views."internal_pv", views."search_pv", views."social_pv", views."external_pv", articles."title"
          FROM "article_daily_views" AS views
          INNER JOIN "articles" AS articles ON articles."id" = views."article_id"
          CROSS JOIN bounds
          WHERE views."day" BETWEEN bounds.from_day AND bounds.to_day AND ${publicPredicate}
        ), daily AS (
          SELECT days.day::text AS day, COALESCE(SUM(eligible."total_pv"), 0)::text AS pv
          FROM bounds
          CROSS JOIN LATERAL generate_series(bounds.from_day, bounds.to_day, interval '1 day') AS days(day)
          LEFT JOIN eligible ON eligible."day" = days.day::date
          GROUP BY days.day
          ORDER BY days.day
        ), source_totals AS (
          SELECT
            COALESCE(SUM("direct_pv"), 0)::text AS direct,
            COALESCE(SUM("internal_pv"), 0)::text AS internal,
            COALESCE(SUM("search_pv"), 0)::text AS search,
            COALESCE(SUM("social_pv"), 0)::text AS social,
            COALESCE(SUM("external_pv"), 0)::text AS external
          FROM eligible
        ), top_articles AS (
          SELECT "article_id", MAX("title") AS title, SUM("total_pv")::text AS total_pv
          FROM eligible
          GROUP BY "article_id"
          HAVING SUM("total_pv") > 0
          ORDER BY SUM("total_pv") DESC, MAX("title") ASC, "article_id" ASC
          LIMIT ${limit}
        )
        SELECT
          bounds.from_day::text AS "fromDay",
          bounds.to_day::text AS "toDay",
          COALESCE((SELECT SUM("total_pv") FROM eligible), 0)::text AS "totalPv",
          COALESCE((SELECT json_agg(json_build_object('day', day, 'pv', pv) ORDER BY day) FROM daily), '[]'::json) AS daily,
          json_build_array(
            json_build_object('source', 'direct', 'totalPv', source_totals.direct),
            json_build_object('source', 'internal', 'totalPv', source_totals.internal),
            json_build_object('source', 'search', 'totalPv', source_totals.search),
            json_build_object('source', 'social', 'totalPv', source_totals.social),
            json_build_object('source', 'external', 'totalPv', source_totals.external)
          ) AS sources,
          COALESCE((SELECT json_agg(json_build_object('articleId', "article_id", 'title', title, 'status', 'published', 'totalPv', total_pv) ORDER BY total_pv::bigint DESC, title ASC, "article_id" ASC) FROM top_articles), '[]'::json) AS "topArticles"
        FROM bounds
        CROSS JOIN source_totals
      `);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row || typeof row.fromDay !== "string" || typeof row.toDay !== "string") throw new Error("analytics query returned no bounds");
      const daily = rows(row.daily, "daily").map((item) => {
        const point = item as Record<string, unknown>;
        return { day: point.day, pv: nonNegativeSafeInteger(point.pv, "daily pv") };
      });
      const sourceRows = rows(row.sources, "sources");
      const sources = sourceRows.map((item) => {
        const source = item as Record<string, unknown>;
        return { source: source.source, totalPv: nonNegativeSafeInteger(source.totalPv, "source total") };
      });
      const topArticles = rows(row.topArticles, "top articles").map((item) => {
        const article = item as Record<string, unknown>;
        return { articleId: article.articleId, title: article.title, status: "published" as const, totalPv: nonNegativeSafeInteger(article.totalPv, "top total") };
      });
      return adminAnalyticsResponseSchema.parse({
        range,
        timezone: "Asia/Shanghai",
        fromDay: row.fromDay,
        toDay: row.toDay,
        totalPv: nonNegativeSafeInteger(row.totalPv, "total"),
        daily,
        sources,
        topArticles,
      });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  return { read };
}

export type AdminAnalyticsRepository = ReturnType<typeof createAdminAnalyticsRepository>;

export const adminAnalyticsSourceOrder = anonymousViewSourceValues;
