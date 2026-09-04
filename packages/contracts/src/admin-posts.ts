import { z } from "zod";
import { mediaUsageReferenceSchema } from "./media";

const slugPattern = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
const publishedAtInputSchema = z.union([z.string().datetime({ offset: true }), z.null()]);
const scheduledAtSchema = z.string().datetime({ offset: true });
export const adminPostInputSchema = z.object({
  title: z.string().trim().min(1, "请输入标题").max(240, "标题不能超过 240 个字符"),
  summary: z.string().trim().max(1_000, "摘要不能超过 1000 个字符"),
  // New authoring uses API-owned uploaded media only. Retained historic values
  // remain representable by the response schema below for explicit repair.
  coverUrl: z.string().max(0, "封面 URL 已停用；请使用已上传媒体"),
  slug: z.string().trim().min(1, "请输入 Slug").max(180, "Slug 不能超过 180 个字符").regex(slugPattern, "Slug 只能包含字母、数字和单个连字符"),
  markdown: z.string().trim().min(1, "请输入 Markdown 正文").max(200_000, "正文不能超过 200000 个字符"),
  publishedAt: publishedAtInputSchema.optional().default(null),
  seoDescription: z.string().trim().max(320, "SEO 描述不能超过 320 个字符"),
  categoryId: z.uuid().nullable().optional().default(null),
  tagIds: z.array(z.uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, "标签不能重复").optional().default([]),
  coverMedia: mediaUsageReferenceSchema.nullable().optional(),
}).strict();

export const publishedSlugConfirmationSchema = z.object({
  articleId: z.uuid(),
  currentSlug: z.string(),
  version: z.string().datetime({ offset: true }),
}).strict();

export const adminPostUpdateSchema = adminPostInputSchema.extend({
  publishedAtCorrection: z.boolean().optional().default(false),
  slugChangeConfirmation: publishedSlugConfirmationSchema.optional(),
}).strict();

export const articleStatusSchema = z.enum(["draft", "published", "unpublished"]);
export const legacyMediaReviewSchema = z.enum(["pending", "clear", "review_required"]);

export const adminPostSchema = adminPostInputSchema.omit({ coverUrl: true }).extend({
  coverUrl: z.string(),
  id: z.uuid(),
  status: articleStatusSchema,
  legacyMediaReview: legacyMediaReviewSchema,
  version: z.string().datetime({ offset: true }),
  // The schedule actor is retained authority for the local due publisher and
  // deliberately never crosses the authenticated admin response boundary.
  scheduledAt: scheduledAtSchema.nullable().default(null),
}).strict();

export const adminPostListSchema = z.array(adminPostSchema);
export const articleActionSchema = z.enum(["publish", "unpublish", "republish", "delete"]);
export const lifecycleActionInputSchema = z.object({}).strict().optional().default({});
export const deletedArticleSchema = z.object({ id: z.uuid(), deleted: z.literal(true) }).strict();

export const scheduleArticleInputSchema = z.object({
  scheduledAt: scheduledAtSchema,
}).strict();

export const scheduleConflictResponseSchema = z.object({
  error: z.literal("schedule_conflict"),
  status: articleStatusSchema,
  reason: z.enum(["not_draft", "not_scheduled"]),
}).strict();

export const invalidTransitionResponseSchema = z.object({
  error: z.literal("invalid_transition"),
  status: articleStatusSchema,
  action: articleActionSchema,
}).strict();

export const publishedSlugConfirmationRequiredSchema = z.object({
  error: z.literal("published_slug_confirmation_required"),
  currentSlug: z.string(),
  requestedSlug: z.string(),
  version: z.string().datetime({ offset: true }),
}).strict();

export const adminPostPreviewInputSchema = z.object({
  markdown: z.string().max(200_000, "正文不能超过 200000 个字符"),
}).strict();

export const adminPostPreviewSchema = z.object({ html: z.string() }).strict();
export const slugSuggestionSchema = z.object({ slug: z.string() }).strict();
export const adminPostIdSchema = z.uuid();

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
export type AdminPostUpdateInput = z.infer<typeof adminPostUpdateSchema>;
export type AdminPost = z.infer<typeof adminPostSchema>;
export type ArticleAction = z.infer<typeof articleActionSchema>;
export type ArticleStatus = z.infer<typeof articleStatusSchema>;
export type LegacyMediaReview = z.infer<typeof legacyMediaReviewSchema>;
export type PublishedSlugConfirmation = z.infer<typeof publishedSlugConfirmationSchema>;
export type FieldErrorResponse = z.infer<typeof fieldErrorResponseSchema>;
export type ScheduleArticleInput = z.infer<typeof scheduleArticleInputSchema>;
