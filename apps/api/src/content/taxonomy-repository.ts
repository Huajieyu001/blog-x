import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { publicPostListResponseSchema, publicPostPageSize } from "@blog-x/contracts";
import * as schema from "../db/schema.js";
import { publicPredicate } from "./public-repository.js";

type Database = NodePgDatabase<typeof schema>;
type Kind = "categories" | "tags";
const tableFor = (kind: Kind) => kind === "categories" ? schema.categories : schema.tags;

export function createTaxonomyRepository(db: Database) {
  async function list(kind: Kind, publishedOnly = false) {
    const table = tableFor(kind);
    const association = kind === "categories" ? schema.articles.categoryId : schema.articleTags.tagId;
    const join = kind === "categories" ? schema.articles : schema.articleTags;
    const predicate = publishedOnly ? publicPredicate : undefined;
    const rows = kind === "categories"
      ? await db.select({ id: table.id, name: table.name, slug: table.slug, articleCount: count(schema.articles.id) }).from(table).leftJoin(schema.articles, and(eq(schema.articles.categoryId, table.id), predicate)).groupBy(table.id).orderBy(table.name)
      : await db.select({ id: table.id, name: table.name, slug: table.slug, articleCount: count(schema.articles.id) }).from(table).leftJoin(schema.articleTags, eq(schema.articleTags.tagId, table.id)).leftJoin(schema.articles, and(eq(schema.articles.id, schema.articleTags.articleId), predicate)).groupBy(table.id).orderBy(table.name);
    return publishedOnly ? rows.filter((row) => Number(row.articleCount) > 0) : rows;
  }
  async function find(kind: Kind, slug: string) { const table = tableFor(kind); return (await db.select().from(table).where(eq(table.slug, slug)).limit(1))[0] ?? null; }
  async function create(kind: Kind, value: { name: string; slug: string }) { const table = tableFor(kind); return (await db.insert(table).values(value).returning())[0]!; }
  async function update(kind: Kind, id: string, value: { name: string; slug: string }) { const table = tableFor(kind); return (await db.update(table).set({ ...value, updatedAt: new Date() }).where(eq(table.id, id)).returning())[0] ?? null; }
  async function remove(kind: Kind, id: string) {
    return db.transaction(async (tx) => {
      const associated = kind === "categories"
        ? await tx.select({ total: count() }).from(schema.articles).where(eq(schema.articles.categoryId, id))
        : await tx.select({ total: count() }).from(schema.articleTags).where(eq(schema.articleTags.tagId, id));
      const articleCount = Number(associated[0]?.total ?? 0);
      if (articleCount) return { deleted: false as const, articleCount };
      const table = tableFor(kind);
      const deleted = await tx.delete(table).where(eq(table.id, id)).returning({ id: table.id });
      return deleted[0] ? { deleted: true as const, articleCount: 0 } : null;
    });
  }
  async function publicArticles(kind: Kind, slug: string, page: number) {
    const term = await find(kind, slug); if (!term) return null;
    const where = kind === "categories" ? and(publicPredicate, eq(schema.categories.slug, slug)) : and(publicPredicate, eq(schema.tags.slug, slug));
    const base = kind === "categories"
      ? db.select({ total: count() }).from(schema.articles).innerJoin(schema.categories, eq(schema.articles.categoryId, schema.categories.id)).where(where)
      : db.select({ total: count() }).from(schema.articles).innerJoin(schema.articleTags, eq(schema.articleTags.articleId, schema.articles.id)).innerJoin(schema.tags, eq(schema.articleTags.tagId, schema.tags.id)).where(where);
    const totalItems = Number((await base)[0]?.total ?? 0);
    const rows = kind === "categories"
      ? await db.select({ title: schema.articles.title, summary: schema.articles.summary, slug: schema.articles.slug, publishedAt: schema.articles.publishedAt, status: schema.articles.status }).from(schema.articles).innerJoin(schema.categories, eq(schema.articles.categoryId, schema.categories.id)).where(where).orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id)).limit(publicPostPageSize).offset((page - 1) * publicPostPageSize)
      : await db.selectDistinct({ title: schema.articles.title, summary: schema.articles.summary, slug: schema.articles.slug, publishedAt: schema.articles.publishedAt, status: schema.articles.status, id: schema.articles.id }).from(schema.articles).innerJoin(schema.articleTags, eq(schema.articleTags.articleId, schema.articles.id)).innerJoin(schema.tags, eq(schema.articleTags.tagId, schema.tags.id)).where(where).orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id)).limit(publicPostPageSize).offset((page - 1) * publicPostPageSize);
    return { term, posts: publicPostListResponseSchema.parse({ page, pageSize: publicPostPageSize, totalItems, totalPages: Math.ceil(totalItems / publicPostPageSize), items: rows.map((row) => ({ title: row.title, summary: row.summary, slug: row.slug, status: "published", publishedAt: row.publishedAt!.toISOString(), tags: [], category: null })) }) };
  }
  return { list, find, create, update, remove, publicArticles };
}
export type TaxonomyRepository = ReturnType<typeof createTaxonomyRepository>;
