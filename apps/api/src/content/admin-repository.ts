import type { AdminPostInput } from "@blog-x/contracts";
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
}>;

type RetainedArticleUpdate = (
  changes: RetainedArticleChanges,
  tagIds?: string[],
) => Promise<StoredAdminPost>;

function values(input: AdminPostInput) {
  return { ...input, publishedAt: input.publishedAt ? new Date(input.publishedAt) : null };
}

export function createAdminPostRepository(db: Database) {
  async function createDraft(input: AdminPostInput) {
    return db.transaction(async (tx) => { const { tagIds, ...article } = values(input); const created = (await tx.insert(schema.articles).values({ ...article, status: "draft" }).returning(selectedPost))[0]; if (!created) return null; if (tagIds.length) await tx.insert(schema.articleTags).values(tagIds.map((tagId) => ({ articleId: created.id, tagId }))); return { ...created, tagIds }; });
  }

  async function findRetainedById(id: string) {
    const post = (await db.select(selectedPost).from(schema.articles).where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt))).limit(1))[0]; if (!post) return null; const tagIds = (await db.select({ tagId: schema.articleTags.tagId }).from(schema.articleTags).where(eq(schema.articleTags.articleId, id))).map((row) => row.tagId); return { ...post, tagIds };
  }

  async function listRetained() {
    const posts = await db.select(selectedPost).from(schema.articles).where(isNull(schema.articles.deletedAt)).orderBy(desc(schema.articles.updatedAt)); return Promise.all(posts.map(async (post) => ({ ...post, tagIds: (await db.select({ tagId: schema.articleTags.tagId }).from(schema.articleTags).where(eq(schema.articleTags.articleId, post.id))).map((row) => row.tagId) })));
  }

  async function transactRetained<T>(
    id: string,
    operation: (current: StoredAdminPost, update: RetainedArticleUpdate) => Promise<T>,
  ): Promise<T | null> {
    return db.transaction(async (tx) => {
      const current = (await tx.select(selectedPost).from(schema.articles)
        .where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt))).limit(1).for("update"))[0];
      if (!current) return null;
      const currentWithTags: StoredAdminPost = { ...current, tagIds: (await tx.select({ tagId: schema.articleTags.tagId }).from(schema.articleTags).where(eq(schema.articleTags.articleId, id))).map((row) => row.tagId) };
      const update: RetainedArticleUpdate = async (changes, tagIds) => {
        const updated = (await tx.update(schema.articles).set(changes).where(eq(schema.articles.id, id)).returning(selectedPost))[0];
        if (!updated) throw new Error("retained article update did not return a row");
        if (tagIds) {
          await tx.delete(schema.articleTags).where(eq(schema.articleTags.articleId, id));
          if (tagIds.length) {
            await tx.insert(schema.articleTags).values(tagIds.map((tagId) => ({ articleId: id, tagId })));
          }
        }
        return { ...updated, tagIds: tagIds ?? currentWithTags.tagIds };
      };
      return operation(currentWithTags, update);
    });
  }

  return { createDraft, findRetainedById, listRetained, transactRetained };
}

export type AdminPostRepository = ReturnType<typeof createAdminPostRepository>;
