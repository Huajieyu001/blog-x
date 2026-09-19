import { z } from "zod";

const boundedLimitSchema = z.number().int().min(1).max(10_000);
const countSchema = z.number().int().nonnegative();
const timestampSchema = z.string().datetime({ offset: true });

/** Aggregate-only result for the bounded secondary retention command. */
export const operationalRetentionResultSchema = z.object({
  format: z.literal("blog-x-operational-retention"),
  version: z.literal(1),
  command: z.literal("retention"),
  observedAt: timestampSchema,
  views: z.object({
    limit: boundedLimitSchema,
    retainedFromDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deleted: countSchema,
  }).strict(),
  sessions: z.object({
    limit: boundedLimitSchema,
    deleted: countSchema,
    expiredBefore: timestampSchema,
    revokedBefore: timestampSchema,
  }).strict(),
}).strict();

export type OperationalRetentionResult = z.infer<typeof operationalRetentionResultSchema>;
