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

const adminAnalyticsResponseBaseSchema = z.object({
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

function addCalendarDays(day: string, amount: number) {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export const adminAnalyticsResponseSchema = adminAnalyticsResponseBaseSchema.superRefine((value, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: "custom", path, message });
  if (value.daily.length !== value.range) issue(["daily"], "daily series length must equal range");
  if (value.daily[0]?.day !== value.fromDay) issue(["fromDay"], "fromDay must equal the first daily day");
  if (value.daily.at(-1)?.day !== value.toDay) issue(["toDay"], "toDay must equal the last daily day");
  if (addCalendarDays(value.fromDay, value.range - 1) !== value.toDay) issue(["toDay"], "range endpoints are inconsistent");
  for (let index = 0; index < value.daily.length; index += 1) {
    const point = value.daily[index]!;
    const expected = addCalendarDays(value.fromDay, index);
    if (!expected || point.day !== expected) issue(["daily", index, "day"], "daily days must be consecutive Shanghai calendar days");
  }
  if (value.daily.reduce((sum, point) => sum + point.pv, 0) !== value.totalPv) issue(["daily"], "daily PV must equal total PV");
  if (value.sources.length !== anonymousViewSourceValues.length) issue(["sources"], "all source buckets are required");
  for (const [index, source] of anonymousViewSourceValues.entries()) {
    if (value.sources[index]?.source !== source) issue(["sources", index, "source"], "source buckets must be complete and fixed-order");
  }
  if (value.sources.reduce((sum, source) => sum + source.totalPv, 0) !== value.totalPv) issue(["sources"], "source PV must equal total PV");
  if (value.topArticles.length > 8) issue(["topArticles"], "top article cap is eight");
  for (let index = 0; index < value.topArticles.length; index += 1) {
    const article = value.topArticles[index]!;
    if (article.totalPv <= 0) issue(["topArticles", index, "totalPv"], "top articles require positive PV");
    const previous = value.topArticles[index - 1];
    if (previous && (previous.totalPv < article.totalPv || (previous.totalPv === article.totalPv && (previous.title > article.title || (previous.title === article.title && previous.articleId > article.articleId))))) {
      issue(["topArticles", index], "top articles must use deterministic PV, title, and id ordering");
    }
  }
});

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
