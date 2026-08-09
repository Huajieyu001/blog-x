import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { publicDistributionSchema, publicPostListResponseSchema, publicPostPageSize } from "@blog-x/contracts";
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

export function createPublicRepository(db: Database) {
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
        items: await Promise.all(rows.map(async (row) => {
          if (!row.publishedAt || row.status !== "published") throw new Error("public predicate returned a non-public article");
          const tags = await tx.select({ name: schema.tags.name, slug: schema.tags.slug })
            .from(schema.articleTags)
            .innerJoin(schema.tags, eq(schema.articleTags.tagId, schema.tags.id))
            .where(eq(schema.articleTags.articleId, row.id))
            .orderBy(schema.tags.name);
          return {
            title: row.title,
            summary: row.summary,
            slug: row.slug,
            status: "published" as const,
            publishedAt: row.publishedAt.toISOString(),
            category: row.categoryId && row.categoryName && row.categorySlug
              ? { name: row.categoryName, slug: row.categorySlug }
              : null,
            tags,
          };
        })),
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

  return { distribution, findDetailBySlug, listPage };
}

export type PublicRepository = ReturnType<typeof createPublicRepository>;
