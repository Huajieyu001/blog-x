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
}>;

function values(input: AdminPostInput) {
  return { ...input, publishedAt: input.publishedAt ? new Date(input.publishedAt) : null };
}

export function createAdminPostRepository(db: Database) {
  async function createDraft(input: AdminPostInput) {
    return (await db.insert(schema.articles).values({ ...values(input), status: "draft" }).returning(selectedPost))[0] ?? null;
  }

  async function findRetainedById(id: string) {
    return (await db.select(selectedPost).from(schema.articles)
      .where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt))).limit(1))[0] ?? null;
  }

  async function listRetained() {
    return db.select(selectedPost).from(schema.articles)
      .where(isNull(schema.articles.deletedAt)).orderBy(desc(schema.articles.updatedAt));
  }

  async function transactRetained<T>(
    id: string,
    operation: (current: StoredAdminPost, update: (changes: RetainedArticleChanges) => Promise<StoredAdminPost>) => Promise<T>,
  ): Promise<T | null> {
    return db.transaction(async (tx) => {
      const current = (await tx.select(selectedPost).from(schema.articles)
        .where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt))).limit(1).for("update"))[0];
      if (!current) return null;
      const update = async (changes: RetainedArticleChanges) => {
        const updated = (await tx.update(schema.articles).set(changes).where(eq(schema.articles.id, id)).returning(selectedPost))[0];
        if (!updated) throw new Error("retained article update did not return a row");
        return updated;
      };
      return operation(current, update);
    });
  }

  return { createDraft, findRetainedById, listRetained, transactRetained };
}

export type AdminPostRepository = ReturnType<typeof createAdminPostRepository>;
