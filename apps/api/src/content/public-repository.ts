import { and, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import {
  publicDistributionSchema,
  publicPostListResponseSchema,
  publicPostPageSize,
  publicRelatedPostLimit,
  publicRelatedPostsResponseSchema,
  publicSearchPageSize,
  publicSearchResponseSchema,
} from "@blog-x/contracts";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;

export const publicPredicate = and(
  eq(schema.articles.status, "published"),
  isNull(schema.articles.deletedAt),
  isNotNull(schema.articles.publishedAt),
);

export const publicListSelection = {
  id: schema.articles.id,
  title: schema.articles.title,
  summary: schema.articles.summary,
  slug: schema.articles.slug,
  publishedAt: schema.articles.publishedAt,
  status: schema.articles.status,
  categoryId: schema.articles.categoryId,
};

const publicDetailSelection = {
  ...publicListSelection,
  seoDescription: schema.articles.seoDescription,
  markdown: schema.articles.markdown,
  coverMediaId: schema.articles.coverMediaId,
  coverAlt: schema.articles.coverAlt,
  coverDecorative: schema.articles.coverDecorative,
};

type PublicCardRow = {
  id: string;
  title: string;
  summary: string;
  slug: string;
  publishedAt: Date | null;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

export class SearchUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("public search unavailable", { cause });
    this.name = "SearchUnavailableError";
  }
}

function escapeLikeLiteral(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function isStatementCancellation(error: unknown): error is { code: "57014" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "57014";
}

export function createPublicRepository(db: Database) {
  async function hydratePublicCards(tx: Pick<Database, "select">, rows: PublicCardRow[]) {
    const tagsByArticle = new Map<string, Array<{ name: string; slug: string }>>();
    if (rows.length > 0) {
      const tagRows = await tx.select({
        articleId: schema.articleTags.articleId,
        id: schema.tags.id,
        name: schema.tags.name,
        slug: schema.tags.slug,
      }).from(schema.articleTags)
        .innerJoin(schema.tags, eq(schema.articleTags.tagId, schema.tags.id))
        .where(inArray(schema.articleTags.articleId, rows.map((row) => row.id)))
        .orderBy(schema.articleTags.articleId, schema.tags.name, schema.tags.id);
      for (const tag of tagRows) {
        const articleTags = tagsByArticle.get(tag.articleId) ?? [];
        articleTags.push({ name: tag.name, slug: tag.slug });
        tagsByArticle.set(tag.articleId, articleTags);
      }
    }

    return rows.map((row) => {
      if (!row.publishedAt || row.status !== "published") throw new Error("public predicate returned a non-public article");
      return {
        title: row.title,
        summary: row.summary,
        slug: row.slug,
        status: "published" as const,
        publishedAt: row.publishedAt.toISOString(),
        category: row.categoryId && row.categoryName && row.categorySlug
          ? { name: row.categoryName, slug: row.categorySlug }
          : null,
        tags: tagsByArticle.get(row.id) ?? [],
      };
    });
  }

  async function listPage(page: number) {
    return db.transaction(async (tx) => {
      const totals = await tx.select({ totalItems: count() }).from(schema.articles).where(publicPredicate);
      const totalItems = totals[0]?.totalItems ?? 0;
      const rows = await tx.select({
        ...publicListSelection,
        categoryName: schema.categories.name,
        categorySlug: schema.categories.slug,
      }).from(schema.articles)
        .leftJoin(schema.categories, eq(schema.articles.categoryId, schema.categories.id))
        .where(publicPredicate)
        .orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id))
        .limit(publicPostPageSize)
        .offset((page - 1) * publicPostPageSize);

      return publicPostListResponseSchema.parse({
        page,
        pageSize: publicPostPageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / publicPostPageSize),
        items: await hydratePublicCards(tx, rows),
      });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async function searchPage(query: string, page: number) {
    if (query.length === 0) {
      return publicSearchResponseSchema.parse({
        state: "empty_query",
        query,
        page,
        pageSize: publicSearchPageSize,
        totalItems: 0,
        totalPages: 0,
        items: [],
      });
    }

    const pattern = `%${escapeLikeLiteral(query)}%`;
    const titleMatch = sql<boolean>`normalize(${schema.articles.title}, NFC) ILIKE ${pattern} ESCAPE '\\'`;
    const summaryMatch = sql<boolean>`normalize(${schema.articles.summary}, NFC) ILIKE ${pattern} ESCAPE '\\'`;
    const markdownMatch = sql<boolean>`normalize(${schema.articles.markdown}, NFC) ILIKE ${pattern} ESCAPE '\\'`;
    const matchPredicate = or(titleMatch, summaryMatch, markdownMatch);
    const matchClass = sql<number>`CASE WHEN ${titleMatch} THEN 3 WHEN ${summaryMatch} THEN 2 WHEN ${markdownMatch} THEN 1 ELSE 0 END`;

    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '2000ms'`);
        const totals = await tx.select({ totalItems: count() })
          .from(schema.articles)
          .where(and(publicPredicate, matchPredicate));
        const totalItems = totals[0]?.totalItems ?? 0;
        const totalPages = Math.ceil(totalItems / publicSearchPageSize);
        if (totalItems === 0) {
          return publicSearchResponseSchema.parse({
            state: "no_results",
            query,
            page,
            pageSize: publicSearchPageSize,
            totalItems,
            totalPages,
            items: [],
          });
        }

        if (page > totalPages) {
          return publicSearchResponseSchema.parse({
            state: "page_out_of_range",
            query,
            page,
            pageSize: publicSearchPageSize,
            totalItems,
            totalPages,
            items: [],
          });
        }

        const rows = await tx.select({
          ...publicListSelection,
          categoryName: schema.categories.name,
          categorySlug: schema.categories.slug,
        }).from(schema.articles)
          .leftJoin(schema.categories, eq(schema.articles.categoryId, schema.categories.id))
          .where(and(publicPredicate, matchPredicate))
          .orderBy(desc(matchClass), desc(schema.articles.publishedAt), desc(schema.articles.id))
          .limit(publicSearchPageSize)
          .offset((page - 1) * publicSearchPageSize);

        return publicSearchResponseSchema.parse({
          state: "results",
          query,
          page,
          pageSize: publicSearchPageSize,
          totalItems,
          totalPages,
          items: await hydratePublicCards(tx, rows),
        });
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    } catch (error) {
      if (isStatementCancellation(error)) throw new SearchUnavailableError(error);
      throw error;
    }
  }

  async function relatedBySlug(slug: string) {
    return db.transaction(async (tx) => {
      const source = (await tx.select({
        id: schema.articles.id,
        categoryId: schema.articles.categoryId,
      }).from(schema.articles)
        .where(and(publicPredicate, eq(schema.articles.slug, slug)))
        .limit(1))[0];
      if (!source) return null;

      const sourceTags = await tx.select({ tagId: schema.articleTags.tagId })
        .from(schema.articleTags)
        .where(eq(schema.articleTags.articleId, source.id))
        .orderBy(schema.articleTags.tagId);
      const sourceTagIds = sourceTags.map((tag) => tag.tagId);
      if (!source.categoryId && sourceTagIds.length === 0) {
        return publicRelatedPostsResponseSchema.parse({ items: [] });
      }

      const candidateSharedTags = alias(schema.articleTags, "candidate_shared_tags");
      const categoryMatchPredicate = source.categoryId
        ? eq(schema.articles.categoryId, source.categoryId)
        : sql<boolean>`false`;
      const sharedTagJoinPredicate = sourceTagIds.length > 0
        ? inArray(candidateSharedTags.tagId, sourceTagIds)
        : sql<boolean>`false`;
      const categoryMatch = sql<number>`CASE WHEN ${categoryMatchPredicate} THEN 1 ELSE 0 END`;
      const sharedTagCount = sql<number>`count(DISTINCT ${candidateSharedTags.tagId})::int`;

      const rows = await tx.select({
        ...publicListSelection,
        categoryName: schema.categories.name,
        categorySlug: schema.categories.slug,
        categoryMatch,
        sharedTagCount,
      }).from(schema.articles)
        .leftJoin(schema.categories, eq(schema.articles.categoryId, schema.categories.id))
        .leftJoin(candidateSharedTags, and(
          eq(candidateSharedTags.articleId, schema.articles.id),
          sharedTagJoinPredicate,
        ))
        .where(and(
          publicPredicate,
          ne(schema.articles.id, source.id),
          or(categoryMatchPredicate, isNotNull(candidateSharedTags.tagId)),
        ))
        .groupBy(
          schema.articles.id,
          schema.articles.title,
          schema.articles.summary,
          schema.articles.slug,
          schema.articles.publishedAt,
          schema.articles.status,
          schema.articles.categoryId,
          schema.categories.id,
          schema.categories.name,
          schema.categories.slug,
        )
        .orderBy(
          desc(categoryMatch),
          desc(sharedTagCount),
          desc(schema.articles.publishedAt),
          desc(schema.articles.id),
        )
        .limit(publicRelatedPostLimit);

      return publicRelatedPostsResponseSchema.parse({
        items: await hydratePublicCards(tx, rows),
      });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async function findDetailBySlug(slug: string) {
    const rows = await db.select({
      ...publicDetailSelection,
      categoryName: schema.categories.name,
      categorySlug: schema.categories.slug,
    }).from(schema.articles)
      .leftJoin(schema.categories, eq(schema.articles.categoryId, schema.categories.id))
      .where(and(publicPredicate, eq(schema.articles.slug, slug)))
      .limit(1);
    const article = rows[0];
    if (!article) return null;
    if (!article.publishedAt || article.status !== "published") throw new Error("public predicate returned a non-public article");
    const tags = await db.select({ name: schema.tags.name, slug: schema.tags.slug })
      .from(schema.articleTags)
      .innerJoin(schema.tags, eq(schema.articleTags.tagId, schema.tags.id))
      .where(eq(schema.articleTags.articleId, article.id))
      .orderBy(schema.tags.name);
    const cover = article.coverMediaId ? (await db.select({
      id: schema.media.id,
      width: schema.media.width,
      height: schema.media.height,
      mimeType: schema.media.derivativeMimeType,
    }).from(schema.media).where(eq(schema.media.id, article.coverMediaId)).limit(1))[0] : null;
    return {
      title: article.title,
      summary: article.summary,
      seoDescription: article.seoDescription,
      slug: article.slug,
      markdown: article.markdown,
      status: "published" as const,
      category: article.categoryId && article.categoryName && article.categorySlug
        ? { name: article.categoryName, slug: article.categorySlug }
        : null,
      tags,
      publishedAt: article.publishedAt.toISOString(),
      ...(cover ? { cover: { ...cover, url: `/media/${cover.id}`, alt: article.coverAlt, decorative: article.coverDecorative } } : {}),
    };
  }

  async function distribution() {
    return db.transaction(async (tx) => {
      const articles = await tx.select({
        id: schema.articles.id,
        title: schema.articles.title,
        summary: schema.articles.summary,
        slug: schema.articles.slug,
        publishedAt: schema.articles.publishedAt,
        updatedAt: schema.articles.updatedAt,
        categoryId: schema.articles.categoryId,
        categoryName: schema.categories.name,
        categorySlug: schema.categories.slug,
      }).from(schema.articles)
        .leftJoin(schema.categories, eq(schema.articles.categoryId, schema.categories.id))
        .where(publicPredicate)
        .orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id));

      const categories = await tx.select({
        name: schema.categories.name,
        slug: schema.categories.slug,
        articleCount: count(),
      }).from(schema.categories)
        .innerJoin(schema.articles, and(eq(schema.articles.categoryId, schema.categories.id), publicPredicate))
        .groupBy(schema.categories.id, schema.categories.name, schema.categories.slug)
        .orderBy(schema.categories.name, schema.categories.id);

      const tags = await tx.select({
        name: schema.tags.name,
        slug: schema.tags.slug,
        articleCount: count(),
      }).from(schema.tags)
        .innerJoin(schema.articleTags, eq(schema.articleTags.tagId, schema.tags.id))
        .innerJoin(schema.articles, and(eq(schema.articleTags.articleId, schema.articles.id), publicPredicate))
        .groupBy(schema.tags.id, schema.tags.name, schema.tags.slug)
        .orderBy(schema.tags.name, schema.tags.id);

      const about = (await tx.select({ title: schema.sitePages.title, updatedAt: schema.sitePages.updatedAt })
        .from(schema.sitePages)
        .where(and(eq(schema.sitePages.key, "about"), eq(schema.sitePages.status, "published")))
        .limit(1))[0] ?? null;

      return publicDistributionSchema.parse({
        articles: await Promise.all(articles.map(async (article) => {
          if (!article.publishedAt) throw new Error("public predicate returned an article without publication time");
          const articleTags = await tx.select({ name: schema.tags.name, slug: schema.tags.slug })
            .from(schema.articleTags)
            .innerJoin(schema.tags, eq(schema.articleTags.tagId, schema.tags.id))
            .where(eq(schema.articleTags.articleId, article.id))
            .orderBy(schema.tags.name, schema.tags.id);
          return {
            title: article.title,
            summary: article.summary,
            slug: article.slug,
            publishedAt: article.publishedAt.toISOString(),
            updatedAt: article.updatedAt.toISOString(),
            category: article.categoryId && article.categoryName && article.categorySlug
              ? { name: article.categoryName, slug: article.categorySlug }
              : null,
            tags: articleTags,
          };
        })),
        categories,
        tags,
        about: about && { title: about.title, updatedAt: about.updatedAt.toISOString() },
      });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  return { distribution, findDetailBySlug, listPage, relatedBySlug, searchPage };
}

export type PublicRepository = ReturnType<typeof createPublicRepository>;
