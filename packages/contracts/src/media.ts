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

export type MediaReference = z.infer<typeof mediaReferenceSchema>;
export type MediaMimeType = z.infer<typeof mediaMimeTypeSchema>;
