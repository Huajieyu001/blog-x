import { legacyMediaReviewSchema, mediaReferenceSchema, type AdminPostInput, type MediaReference } from "@blog-x/contracts";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;
const selectedPost = {
  id: schema.articles.id,
  title: schema.articles.title,
  summary: schema.articles.summary,
  coverUrl: schema.articles.coverUrl,
  slug: schema.articles.slug,
  markdown: schema.articles.markdown,
  publishedAt: schema.articles.publishedAt,
  seoDescription: schema.articles.seoDescription,
  status: schema.articles.status,
  updatedAt: schema.articles.updatedAt,
  categoryId: schema.articles.categoryId,
  coverMediaId: schema.articles.coverMediaId,
  coverAlt: schema.articles.coverAlt,
  coverDecorative: schema.articles.coverDecorative,
  legacyMediaReview: schema.articles.legacyMediaReview,
};

export type StoredAdminPost = {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  slug: string;
  markdown: string;
  publishedAt: Date | null;
  seoDescription: string;
  status: string;
  updatedAt: Date;
  categoryId: string | null;
  tagIds: string[];
  coverMedia: MediaReference | null;
  legacyMediaReview: "pending" | "clear" | "review_required";
};

export type RetainedArticleChanges = Partial<{
  title: string;
  summary: string;
  coverUrl: string;
  slug: string;
  markdown: string;
  publishedAt: Date | null;
  seoDescription: string;
  status: string;
  deletedAt: Date;
  updatedAt: Date;
  categoryId: string | null;
  coverMediaId: string | null;
  coverAlt: string;
  coverDecorative: boolean;
  legacyMediaReview: "pending" | "clear" | "review_required";
}>;

type RetainedArticleUpdate = (
  changes: RetainedArticleChanges,
  tagIds?: string[],
) => Promise<StoredAdminPost>;

function values(input: AdminPostInput) {
  const { tagIds, coverMedia, ...article } = input;
  return {
    article: {
      ...article,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      coverMediaId: coverMedia?.id ?? null,
      coverAlt: coverMedia?.alt ?? "",
      coverDecorative: coverMedia?.decorative ?? false,
      legacyMediaReview: "clear" as const,
    },
    tagIds,
  };
}

export function createAdminPostRepository(db: Database) {
  async function hydrate(executor: Database, post: typeof schema.articles.$inferSelect, tagIds?: string[]): Promise<StoredAdminPost> {
    const resolvedTags = tagIds ?? (await executor.select({ tagId: schema.articleTags.tagId }).from(schema.articleTags).where(eq(schema.articleTags.articleId, post.id))).map((row) => row.tagId);
    let coverMedia: MediaReference | null = null;
    if (post.coverMediaId) {
      const asset = (await executor.select({ id: schema.media.id, width: schema.media.width, height: schema.media.height, mimeType: schema.media.derivativeMimeType }).from(schema.media).where(eq(schema.media.id, post.coverMediaId)).limit(1))[0];
      if (!asset) throw new Error("cover media reference is missing");
      coverMedia = mediaReferenceSchema.parse({ ...asset, url: `/media/${asset.id}`, alt: post.coverAlt, decorative: post.coverDecorative });
    }
    const { coverMediaId: _coverMediaId, coverAlt: _coverAlt, coverDecorative: _coverDecorative, legacyMediaReview, ...stored } = post;
    return { ...stored, legacyMediaReview: legacyMediaReviewSchema.parse(legacyMediaReview), tagIds: resolvedTags, coverMedia };
  }

  async function createDraft(input: AdminPostInput) {
    return db.transaction(async (tx) => { const { tagIds, article } = values(input); const created = (await tx.insert(schema.articles).values({ ...article, status: "draft" }).returning(selectedPost))[0]; if (!created) return null; if (tagIds.length) await tx.insert(schema.articleTags).values(tagIds.map((tagId) => ({ articleId: created.id, tagId }))); return hydrate(tx as Database, created as typeof schema.articles.$inferSelect, tagIds); });
  }

  async function findRetainedById(id: string) {
    const post = (await db.select(selectedPost).from(schema.articles).where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt))).limit(1))[0]; if (!post) return null; return hydrate(db, post as typeof schema.articles.$inferSelect);
  }

  async function listRetained() {
    const posts = await db.select(selectedPost).from(schema.articles).where(isNull(schema.articles.deletedAt)).orderBy(desc(schema.articles.updatedAt)); return Promise.all(posts.map((post) => hydrate(db, post as typeof schema.articles.$inferSelect)));
  }

  async function transactRetained<T>(
    id: string,
    operation: (current: StoredAdminPost, update: RetainedArticleUpdate) => Promise<T>,
  ): Promise<T | null> {
    return db.transaction(async (tx) => {
      const current = (await tx.select(selectedPost).from(schema.articles)
        .where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt))).limit(1).for("update"))[0];
      if (!current) return null;
      const currentWithTags = await hydrate(tx as Database, current as typeof schema.articles.$inferSelect);
      const update: RetainedArticleUpdate = async (changes, tagIds) => {
        const updated = (await tx.update(schema.articles).set(changes).where(eq(schema.articles.id, id)).returning(selectedPost))[0];
        if (!updated) throw new Error("retained article update did not return a row");
        if (tagIds) {
          await tx.delete(schema.articleTags).where(eq(schema.articleTags.articleId, id));
          if (tagIds.length) {
            await tx.insert(schema.articleTags).values(tagIds.map((tagId) => ({ articleId: id, tagId })));
          }
        }
        return hydrate(tx as Database, updated as typeof schema.articles.$inferSelect, tagIds ?? currentWithTags.tagIds);
      };
      return operation(currentWithTags, update);
    });
  }

  return { createDraft, findRetainedById, listRetained, transactRetained };
}

export type AdminPostRepository = ReturnType<typeof createAdminPostRepository>;
