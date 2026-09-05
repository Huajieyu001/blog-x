import { z } from "zod";

export const anonymousViewSourceValues = ["direct", "internal", "search", "social", "external"] as const;
export const anonymousViewSourceSchema = z.enum(anonymousViewSourceValues);
export const anonymousViewSlugParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
}).strict();
export const anonymousViewBodySchema = z.object({}).strict();

export const adminAnalyticsRangeValues = [7, 30, 90, 400] as const;
const adminAnalyticsRangeQueryValues = ["7", "30", "90", "400"] as const;
const adminAnalyticsSourceSchema = z.enum(anonymousViewSourceValues);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nonNegativeSafeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** The wire query remains strings so duplicate, signed, decimal, and padded inputs fail closed. */
export const adminAnalyticsQuerySchema = z.object({
  range: z.enum(adminAnalyticsRangeQueryValues).transform((value) => Number(value) as (typeof adminAnalyticsRangeValues)[number]),
  limit: z.string().regex(/^[1-8]$/).transform(Number),
}).strict();

export const adminAnalyticsResponseSchema = z.object({
  range: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(400)]),
  timezone: z.literal("Asia/Shanghai"),
  fromDay: daySchema,
  toDay: daySchema,
  totalPv: nonNegativeSafeIntegerSchema,
  daily: z.array(z.object({ day: daySchema, pv: nonNegativeSafeIntegerSchema }).strict()),
  sources: z.array(z.object({ source: adminAnalyticsSourceSchema, totalPv: nonNegativeSafeIntegerSchema }).strict()),
  topArticles: z.array(z.object({
    articleId: z.string().uuid(),
    title: z.string().min(1),
    status: z.literal("published"),
    totalPv: nonNegativeSafeIntegerSchema,
  }).strict()),
}).strict();

export const viewRetentionResultSchema = z.object({
  format: z.literal("blog-x-view-retention"),
  version: z.literal(1),
  command: z.literal("cleanup-views"),
  retainedFromDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.number().int().min(1).max(10_000),
  deleted: z.number().int().nonnegative(),
}).strict();

export type AnonymousViewSource = z.infer<typeof anonymousViewSourceSchema>;
export type ViewRetentionResult = z.infer<typeof viewRetentionResultSchema>;
export type AdminAnalytics = z.infer<typeof adminAnalyticsResponseSchema>;
export type AdminAnalyticsQuery = z.infer<typeof adminAnalyticsQuerySchema>;
