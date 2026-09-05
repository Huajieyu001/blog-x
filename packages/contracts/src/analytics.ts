import { z } from "zod";

export const anonymousViewSourceValues = ["direct", "internal", "search", "social", "external"] as const;
export const anonymousViewSourceSchema = z.enum(anonymousViewSourceValues);
export const anonymousViewSlugParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
}).strict();
export const anonymousViewBodySchema = z.object({}).strict();

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
