import { randomUUID } from "node:crypto";
import { mediaUploadResponseSchema } from "@blog-x/contracts";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { processMedia } from "../media/processor.js";
import type { MediaStorage } from "../media/storage.js";

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

  return { upload, findDerivative };
}

export type MediaService = ReturnType<typeof createMediaService>;
