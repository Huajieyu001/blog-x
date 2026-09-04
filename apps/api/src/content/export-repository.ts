import { portableExportManifestSchema, type PortableExportManifest } from "@blog-x/contracts";
import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;

function toIso(value: Date) {
  return value.toISOString();
}

function nullableIso(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function createExportRepository(db: Database) {
  async function archive(): Promise<PortableExportManifest> {
    return db.transaction(async (tx) => {
      const [articleRows, categoryRows, tagRows, relationRows, mediaRows, pageRows] = await Promise.all([
        tx.select({
          id: schema.articles.id, title: schema.articles.title, summary: schema.articles.summary,
          coverUrl: schema.articles.coverUrl, slug: schema.articles.slug, markdown: schema.articles.markdown,
          seoDescription: schema.articles.seoDescription, status: schema.articles.status,
          publishedAt: schema.articles.publishedAt, deletedAt: schema.articles.deletedAt,
          scheduledAt: schema.articles.scheduledAt,
          scheduledByAdministratorId: schema.articles.scheduledByAdministratorId,
          createdAt: schema.articles.createdAt, updatedAt: schema.articles.updatedAt,
          categoryId: schema.articles.categoryId, coverMediaId: schema.articles.coverMediaId,
          coverAlt: schema.articles.coverAlt, coverDecorative: schema.articles.coverDecorative,
          legacyMediaReview: schema.articles.legacyMediaReview,
        }).from(schema.articles).orderBy(asc(schema.articles.id)),
        tx.select().from(schema.categories).orderBy(asc(schema.categories.id)),
        tx.select().from(schema.tags).orderBy(asc(schema.tags.id)),
        tx.select().from(schema.articleTags).orderBy(asc(schema.articleTags.articleId), asc(schema.articleTags.tagId)),
        tx.select({ id: schema.media.id, width: schema.media.width, height: schema.media.height, mimeType: schema.media.derivativeMimeType, createdAt: schema.media.createdAt }).from(schema.media).orderBy(asc(schema.media.id)),
        tx.select().from(schema.sitePages).where(eq(schema.sitePages.key, "about")).orderBy(asc(schema.sitePages.id)),
      ]);
      const tagIdsByArticle = new Map<string, string[]>();
      for (const relation of relationRows) (tagIdsByArticle.get(relation.articleId) ?? tagIdsByArticle.set(relation.articleId, []).get(relation.articleId)!).push(relation.tagId);
      const about = pageRows[0] ?? null;
      return portableExportManifestSchema.parse({
        format: "blog-x-portable-export",
        version: 1,
        exportedAt: new Date().toISOString(),
        articles: articleRows.map((article) => ({
          ...article,
          publishedAt: nullableIso(article.publishedAt), deletedAt: nullableIso(article.deletedAt),
          scheduledAt: nullableIso(article.scheduledAt),
          createdAt: toIso(article.createdAt), updatedAt: toIso(article.updatedAt), tagIds: tagIdsByArticle.get(article.id) ?? [],
        })),
        categories: categoryRows.map((term) => ({ ...term, createdAt: toIso(term.createdAt), updatedAt: toIso(term.updatedAt) })),
        tags: tagRows.map((term) => ({ ...term, createdAt: toIso(term.createdAt), updatedAt: toIso(term.updatedAt) })),
        media: mediaRows.map((media) => ({ ...media, createdAt: toIso(media.createdAt) })),
        about: about && { ...about, version: toIso(about.version), createdAt: toIso(about.createdAt), updatedAt: toIso(about.updatedAt) },
      });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }
  return { archive };
}

export type ExportRepository = ReturnType<typeof createExportRepository>;
