import { z } from "zod";

export const publicPostPageSize = 10;

const pageSchema = z.preprocess(
  (value) => value === undefined ? "1" : value,
  z.string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(Math.floor(Number.MAX_SAFE_INTEGER / publicPostPageSize))),
);

export const publicPostPageQuerySchema = z.object({
  page: pageSchema,
}).strict();

export const publicPostListItemSchema = z.object({
  title: z.string(),
  summary: z.string(),
  slug: z.string(),
  publishedAt: z.string().datetime({ offset: true }),
  status: z.literal("published"),
}).strict();

export const publicPostListResponseSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.literal(publicPostPageSize),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  items: z.array(publicPostListItemSchema),
}).strict();

export const publicPostDetailSchema = publicPostListItemSchema.extend({
  renderedHtml: z.string(),
}).strict();

export const publicPostNotFoundResponseSchema = z.object({
  error: z.literal("not_found"),
}).strict();

export const invalidPublicPageResponseSchema = z.object({
  error: z.literal("invalid_page"),
}).strict();

export type PublicPostListItem = z.infer<typeof publicPostListItemSchema>;
export type PublicPostListResponse = z.infer<typeof publicPostListResponseSchema>;
export type PublicPostDetail = z.infer<typeof publicPostDetailSchema>;
