import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { publicPostListResponseSchema, publicPostPageSize } from "@blog-x/contracts";
import * as schema from "../db/schema.js";
import { appendAuditEvent } from "../audit/audit-repository.js";
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
  async function create(kind: Kind, value: { name: string; slug: string }, actorAdministratorId: string) {
    return db.transaction(async (tx) => {
      const table = tableFor(kind);
      const created = (await tx.insert(table).values(value).returning())[0]!;
      await appendAuditEvent(tx, {
        actorAdministratorId,
        event: kind === "categories" ? "category.created" : "tag.created",
        targetType: kind === "categories" ? "category" : "tag",
        targetId: created.id,
        metadata: { changedFields: ["name", "slug"] },
      });
      return created;
    });
  }
  async function update(kind: Kind, id: string, value: { name: string; slug: string }, actorAdministratorId: string) {
    return db.transaction(async (tx) => {
      const table = tableFor(kind);
      const current = (await tx.select({ id: table.id, name: table.name, slug: table.slug }).from(table).where(eq(table.id, id)).limit(1).for("update"))[0];
      if (!current) return null;
      const updated = (await tx.update(table).set({ ...value, updatedAt: new Date() }).where(eq(table.id, id)).returning())[0];
      if (!updated) return null;
      const changedFields = (["name", "slug"] as const).filter((field) => current[field] !== value[field]);
      await appendAuditEvent(tx, {
        actorAdministratorId,
        event: kind === "categories" ? "category.updated" : "tag.updated",
        targetType: kind === "categories" ? "category" : "tag",
        targetId: updated.id,
        metadata: { changedFields },
      });
      return updated;
    });
  }
  async function remove(kind: Kind, id: string, actorAdministratorId: string) {
    return db.transaction(async (tx) => {
      const associated = kind === "categories"
        ? await tx.select({ total: count() }).from(schema.articles).where(eq(schema.articles.categoryId, id))
        : await tx.select({ total: count() }).from(schema.articleTags).where(eq(schema.articleTags.tagId, id));
      const articleCount = Number(associated[0]?.total ?? 0);
      if (articleCount) return { deleted: false as const, articleCount };
      const table = tableFor(kind);
      const deleted = await tx.delete(table).where(eq(table.id, id)).returning({ id: table.id });
      if (deleted[0]) {
        await appendAuditEvent(tx, {
          actorAdministratorId,
          event: kind === "categories" ? "category.deleted" : "tag.deleted",
          targetType: kind === "categories" ? "category" : "tag",
          targetId: deleted[0].id,
        });
      }
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
    const selection = {
      id: schema.articles.id,
      title: schema.articles.title,
      summary: schema.articles.summary,
      slug: schema.articles.slug,
      publishedAt: schema.articles.publishedAt,
      status: schema.articles.status,
      categoryName: schema.categories.name,
      categorySlug: schema.categories.slug,
    };
    const rows = kind === "categories"
      ? await db.select(selection).from(schema.articles).innerJoin(schema.categories, eq(schema.articles.categoryId, schema.categories.id)).where(where).orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id)).limit(publicPostPageSize).offset((page - 1) * publicPostPageSize)
      : await db.selectDistinct(selection).from(schema.articles).innerJoin(schema.articleTags, eq(schema.articleTags.articleId, schema.articles.id)).innerJoin(schema.tags, eq(schema.articleTags.tagId, schema.tags.id)).leftJoin(schema.categories, eq(schema.articles.categoryId, schema.categories.id)).where(where).orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id)).limit(publicPostPageSize).offset((page - 1) * publicPostPageSize);
    const items = await Promise.all(rows.map(async (row) => ({
      title: row.title,
      summary: row.summary,
      slug: row.slug,
      status: "published" as const,
      publishedAt: row.publishedAt!.toISOString(),
      category: row.categoryName && row.categorySlug ? { name: row.categoryName, slug: row.categorySlug } : null,
      tags: await db.select({ name: schema.tags.name, slug: schema.tags.slug })
        .from(schema.articleTags)
        .innerJoin(schema.tags, eq(schema.articleTags.tagId, schema.tags.id))
        .where(eq(schema.articleTags.articleId, row.id))
        .orderBy(schema.tags.name),
    })));
    return { term, posts: publicPostListResponseSchema.parse({ page, pageSize: publicPostPageSize, totalItems, totalPages: Math.ceil(totalItems / publicPostPageSize), items }) };
  }
  return { list, find, create, update, remove, publicArticles };
}
export type TaxonomyRepository = ReturnType<typeof createTaxonomyRepository>;
