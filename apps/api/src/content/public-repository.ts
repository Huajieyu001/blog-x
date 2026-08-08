import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { publicPostListResponseSchema, publicPostPageSize } from "@blog-x/contracts";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;

const publicPredicate = and(
  eq(schema.articles.status, "published"),
  isNull(schema.articles.deletedAt),
  isNotNull(schema.articles.publishedAt),
);

const publicListSelection = {
  title: schema.articles.title,
  summary: schema.articles.summary,
  slug: schema.articles.slug,
  publishedAt: schema.articles.publishedAt,
  status: schema.articles.status,
};

const publicDetailSelection = {
  ...publicListSelection,
  markdown: schema.articles.markdown,
};

export function createPublicRepository(db: Database) {
  async function listPage(page: number) {
    return db.transaction(async (tx) => {
      const totals = await tx.select({ totalItems: count() }).from(schema.articles).where(publicPredicate);
      const totalItems = totals[0]?.totalItems ?? 0;
      const rows = await tx.select(publicListSelection).from(schema.articles)
        .where(publicPredicate)
        .orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id))
        .limit(publicPostPageSize)
        .offset((page - 1) * publicPostPageSize);

      return publicPostListResponseSchema.parse({
        page,
        pageSize: publicPostPageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / publicPostPageSize),
        items: rows.map((row) => {
          if (!row.publishedAt || row.status !== "published") throw new Error("public predicate returned a non-public article");
          return { ...row, status: "published" as const, publishedAt: row.publishedAt.toISOString() };
        }),
      });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async function findDetailBySlug(slug: string) {
    const rows = await db.select(publicDetailSelection).from(schema.articles)
      .where(and(publicPredicate, eq(schema.articles.slug, slug)))
      .limit(1);
    const article = rows[0];
    if (!article) return null;
    if (!article.publishedAt || article.status !== "published") throw new Error("public predicate returned a non-public article");
    return {
      ...article,
      status: "published" as const,
      publishedAt: article.publishedAt.toISOString(),
    };
  }

  return { findDetailBySlug, listPage };
}

export type PublicRepository = ReturnType<typeof createPublicRepository>;
