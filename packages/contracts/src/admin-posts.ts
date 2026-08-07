import { z } from "zod";

const slugPattern = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
const publishedAtInputSchema = z.union([z.string().datetime({ offset: true }), z.null()]);

export const adminPostInputSchema = z.object({
  title: z.string().trim().min(1, "请输入标题").max(240, "标题不能超过 240 个字符"),
  summary: z.string().trim().max(1_000, "摘要不能超过 1000 个字符"),
  coverUrl: z.union([z.literal(""), z.url("请输入有效的封面 URL")]),
  slug: z.string().trim().min(1, "请输入 Slug").max(180, "Slug 不能超过 180 个字符").regex(slugPattern, "Slug 只能包含字母、数字和单个连字符"),
  markdown: z.string().trim().min(1, "请输入 Markdown 正文").max(200_000, "正文不能超过 200000 个字符"),
  publishedAt: publishedAtInputSchema,
  seoDescription: z.string().trim().max(320, "SEO 描述不能超过 320 个字符"),
}).strict();

export const adminPostSchema = adminPostInputSchema.extend({
  id: z.uuid(),
  status: z.enum(["draft", "published", "unpublished"]),
}).strict();

export const adminPostPreviewInputSchema = z.object({
  markdown: z.string().max(200_000, "正文不能超过 200000 个字符"),
}).strict();

export const adminPostPreviewSchema = z.object({ html: z.string() }).strict();
export const slugSuggestionSchema = z.object({ slug: z.string() }).strict();

export const fieldErrorResponseSchema = z.object({
  error: z.literal("validation_failed"),
  fields: z.record(z.string(), z.array(z.string())),
}).strict();

export const slugConflictResponseSchema = z.object({
  error: z.literal("slug_conflict"),
  fields: z.object({ slug: z.array(z.string()) }).strict(),
}).strict();

export function suggestSlug(title: string) {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
}

export type AdminPostInput = z.infer<typeof adminPostInputSchema>;
export type AdminPost = z.infer<typeof adminPostSchema>;
export type FieldErrorResponse = z.infer<typeof fieldErrorResponseSchema>;
