import type { AdminPostInput } from "@blog-x/contracts";
import { and, eq, isNull } from "drizzle-orm";
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
};

function values(input: AdminPostInput) {
  return {
    ...input,
    publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
  };
}

export function createAdminPostRepository(db: Database) {
  async function createDraft(input: AdminPostInput) {
    return (await db.insert(schema.articles).values({ ...values(input), status: "draft" }).returning(selectedPost))[0] ?? null;
  }

  async function findRetainedById(id: string) {
    return (await db.select(selectedPost).from(schema.articles)
      .where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt))).limit(1))[0] ?? null;
  }

  async function updateDraft(id: string, input: AdminPostInput) {
    return (await db.update(schema.articles).set({ ...values(input), status: "draft", updatedAt: new Date() })
      .where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt)))
      .returning(selectedPost))[0] ?? null;
  }

  return { createDraft, findRetainedById, updateDraft };
}

export type AdminPostRepository = ReturnType<typeof createAdminPostRepository>;
