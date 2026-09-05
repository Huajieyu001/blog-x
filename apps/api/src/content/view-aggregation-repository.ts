import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AnonymousViewSource } from "@blog-x/contracts";
import { publicPredicate } from "./public-repository.js";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;

const sourceColumns = {
  direct: { insert: sql`"direct_pv"`, update: sql`"direct_pv" = "article_daily_views"."direct_pv" + 1` },
  internal: { insert: sql`"internal_pv"`, update: sql`"internal_pv" = "article_daily_views"."internal_pv" + 1` },
  search: { insert: sql`"search_pv"`, update: sql`"search_pv" = "article_daily_views"."search_pv" + 1` },
  social: { insert: sql`"social_pv"`, update: sql`"social_pv" = "article_daily_views"."social_pv" + 1` },
  external: { insert: sql`"external_pv"`, update: sql`"external_pv" = "article_daily_views"."external_pv" + 1` },
} satisfies Record<AnonymousViewSource, { insert: ReturnType<typeof sql>; update: ReturnType<typeof sql> }>;

export function createViewAggregationRepository(db: Database) {
  async function recordPublicView(slug: string, source: AnonymousViewSource) {
    const bucket = sourceColumns[source];
    const result = await db.execute(sql`
      INSERT INTO "article_daily_views" ("article_id", "day", "total_pv", ${bucket.insert})
      SELECT ${schema.articles.id}, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date, 1, 1
      FROM "articles"
      WHERE ${and(publicPredicate, eq(schema.articles.slug, slug))}
      ON CONFLICT ("article_id", "day") DO UPDATE SET
        "total_pv" = "article_daily_views"."total_pv" + 1,
        ${bucket.update}
    `);
    return (result.rowCount ?? 0) === 1;
  }

  return { recordPublicView };
}

export type ViewAggregationRepository = ReturnType<typeof createViewAggregationRepository>;
