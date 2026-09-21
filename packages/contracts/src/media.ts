import { z } from "zod";

export const mediaMimeTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

export const mediaReferenceSchema = z.object({
  id: z.uuid(),
  url: z.string().regex(/^\/media\/[0-9a-f-]{36}$/i),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: mediaMimeTypeSchema,
  alt: z.string().max(500),
  decorative: z.boolean(),
}).strict();

export const mediaUsageReferenceSchema = mediaReferenceSchema.superRefine((media, context) => {
  if (!media.decorative && !media.alt.trim()) {
    context.addIssue({ code: "custom", path: ["alt"], message: "请填写图片替代文本，或明确标记为装饰图片" });
  }
});

export const mediaUploadResponseSchema = mediaReferenceSchema;
export const mediaIdSchema = z.uuid();
export const invalidMediaResponseSchema = z.object({ error: z.literal("invalid_media") }).strict();
export const mediaNotFoundResponseSchema = z.object({ error: z.literal("not_found") }).strict();

/** The catalog deliberately exposes only the public derivative projection. */
export const mediaCatalogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  q: z.string().trim().max(100).default(""),
}).strict();

export const mediaCatalogItemSchema = z.object({
  id: mediaIdSchema,
  url: z.string().regex(/^\/media\/[0-9a-f-]{36}$/i),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: mediaMimeTypeSchema,
  createdAt: z.string().datetime({ offset: true }),
  referenceCount: z.number().int().nonnegative(),
  referenced: z.boolean(),
}).strict();

export const mediaCatalogResponseSchema = z.object({
  page: z.number().int().min(1),
  items: z.array(mediaCatalogItemSchema).max(12),
}).strict();

export const mediaInUseResponseSchema = z.object({
  error: z.literal("media_in_use"),
  referenceCount: z.number().int().positive(),
}).strict();
export const mediaCleanupPendingResponseSchema = z.object({ error: z.literal("media_cleanup_pending") }).strict();
export const mediaUnavailableResponseSchema = z.object({ error: z.literal("media_unavailable") }).strict();
export const mediaDeletedResponseSchema = z.object({ id: mediaIdSchema, deleted: z.literal(true) }).strict();

export type MediaReference = z.infer<typeof mediaReferenceSchema>;
export type MediaMimeType = z.infer<typeof mediaMimeTypeSchema>;
export type MediaCatalogItem = z.infer<typeof mediaCatalogItemSchema>;
export type MediaCatalogResponse = z.infer<typeof mediaCatalogResponseSchema>;
