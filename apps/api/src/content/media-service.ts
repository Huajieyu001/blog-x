import { randomUUID } from "node:crypto";
import { mediaCatalogQuerySchema, mediaCatalogResponseSchema, mediaUploadResponseSchema } from "@blog-x/contracts";
import { desc, eq, ilike } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { processMedia } from "../media/processor.js";
import type { MediaStorage } from "../media/storage.js";
import { extractArticleMediaIds } from "./media-reference-policy.js";

type Database = NodePgDatabase<typeof schema>;

export function createMediaService(db: Database, storage: MediaStorage) {
  async function upload(source: Buffer, declaredMime: string, usage: { alt: string; decorative: boolean } = { alt: "", decorative: false }) {
    const processed = await processMedia(source, declaredMime);
    const id = randomUUID();
    const sourceKey = `source/${id}.bin`;
    const derivativeKey = `derivative/${id}.${processed.extension}`;
    try {
      await storage.putSource(sourceKey, source);
      await storage.putDerivative(derivativeKey, processed.derivative);
      await db.insert(schema.media).values({
        id,
        sourceKey,
        derivativeKey,
        sourceMimeType: processed.mimeType,
        derivativeMimeType: processed.mimeType,
        sourceBytes: source.length,
        derivativeBytes: processed.derivative.length,
        width: processed.width,
        height: processed.height,
      });
      return mediaUploadResponseSchema.parse({
        id,
        url: `/media/${id}`,
        width: processed.width,
        height: processed.height,
        mimeType: processed.mimeType,
        alt: usage.decorative ? "" : usage.alt.trim(),
        decorative: usage.decorative,
      });
    } catch (error) {
      await Promise.all([storage.removeExact(sourceKey), storage.removeExact(derivativeKey)]);
      throw error;
    }
  }

  async function findDerivative(id: string) {
    const row = (await db.select({
      derivativeKey: schema.media.derivativeKey,
      mimeType: schema.media.derivativeMimeType,
    }).from(schema.media).where(eq(schema.media.id, id)).limit(1))[0];
    if (!row) return null;
    return { mimeType: row.mimeType, stream: storage.streamDerivative(row.derivativeKey) };
  }

  async function listCatalog(input: unknown) {
    const query = mediaCatalogQuerySchema.parse(input);
    const rows = await db.select({
      id: schema.media.id,
      width: schema.media.width,
      height: schema.media.height,
      mimeType: schema.media.derivativeMimeType,
      createdAt: schema.media.createdAt,
    }).from(schema.media)
      .where(query.q ? ilike(schema.media.id, `%${query.q}%`) : undefined)
      .orderBy(desc(schema.media.createdAt), desc(schema.media.id))
      .limit(12)
      .offset((query.page - 1) * 12);

    // A personal blog has bounded retained content.  Counting from the AST
    // avoids a brittle text search and de-duplicates each article's repeated
    // uses of the same image.
    const retained = await db.select({
      coverMediaId: schema.articles.coverMediaId,
      markdown: schema.articles.markdown,
    }).from(schema.articles);
    const counts = new Map<string, number>();
    for (const article of retained) {
      const references = extractArticleMediaIds(article.markdown);
      if (article.coverMediaId) references.add(article.coverMediaId);
      for (const id of references) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return mediaCatalogResponseSchema.parse({
      page: query.page,
      items: rows.map((row) => {
        const referenceCount = counts.get(row.id) ?? 0;
        return {
          id: row.id,
          url: `/media/${row.id}`,
          width: row.width,
          height: row.height,
          mimeType: row.mimeType,
          createdAt: row.createdAt.toISOString(),
          referenceCount,
          referenced: referenceCount > 0,
        };
      }),
    });
  }

  return { upload, findDerivative, listCatalog };
}

export type MediaService = ReturnType<typeof createMediaService>;
