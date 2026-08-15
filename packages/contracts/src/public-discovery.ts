import { z } from "zod";
import { publicPostListItemSchema } from "./public-posts.js";

export const publicSearchPageSize = 10;
export const publicSearchMaxPage = 100;
export const publicSearchMaxQueryCodePoints = 80;
export const publicSearchMaxRawCodeUnits = 256;
export const publicRelatedPostLimit = 4;

const publicSearchQueryValueSchema = z.preprocess(
  (value) => value === undefined ? "" : value,
  z.string()
    .max(publicSearchMaxRawCodeUnits)
    .transform((value) => value.normalize("NFC").trim())
    .refine((value) => Array.from(value).length <= publicSearchMaxQueryCodePoints),
);

const publicSearchPageSchema = z.preprocess(
  (value) => value === undefined ? "1" : value,
  z.string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(publicSearchMaxPage)),
);

export const publicSearchQuerySchema = z.object({
  q: publicSearchQueryValueSchema,
  page: publicSearchPageSchema,
}).strict();

const publicSearchEnvelopeFields = {
  query: z.string(),
  page: z.number().int().min(1).max(publicSearchMaxPage),
  pageSize: z.literal(publicSearchPageSize),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  items: z.array(publicPostListItemSchema).max(publicSearchPageSize),
};

const emptyQueryResponseSchema = z.object({
  state: z.literal("empty_query"),
  ...publicSearchEnvelopeFields,
  query: z.literal(""),
  totalItems: z.literal(0),
  totalPages: z.literal(0),
  items: z.tuple([]),
}).strict();

const noResultsResponseSchema = z.object({
  state: z.literal("no_results"),
  ...publicSearchEnvelopeFields,
  query: z.string().min(1),
  totalItems: z.literal(0),
  totalPages: z.literal(0),
  items: z.tuple([]),
}).strict();

const resultsResponseSchema = z.object({
  state: z.literal("results"),
  ...publicSearchEnvelopeFields,
  query: z.string().min(1),
  totalItems: z.number().int().positive(),
  totalPages: z.number().int().positive(),
  items: z.array(publicPostListItemSchema).min(1).max(publicSearchPageSize),
}).strict().superRefine((value, context) => {
  if (value.totalPages !== Math.ceil(value.totalItems / publicSearchPageSize)) {
    context.addIssue({ code: "custom", path: ["totalPages"], message: "totalPages must match totalItems" });
  }
  if (value.page > value.totalPages) {
    context.addIssue({ code: "custom", path: ["page"], message: "results page must be in range" });
  }
});

const outOfRangeResponseSchema = z.object({
  state: z.literal("page_out_of_range"),
  ...publicSearchEnvelopeFields,
  query: z.string().min(1),
  totalItems: z.number().int().positive(),
  totalPages: z.number().int().positive(),
  items: z.tuple([]),
}).strict().superRefine((value, context) => {
  if (value.totalPages !== Math.ceil(value.totalItems / publicSearchPageSize)) {
    context.addIssue({ code: "custom", path: ["totalPages"], message: "totalPages must match totalItems" });
  }
  if (value.page <= value.totalPages) {
    context.addIssue({ code: "custom", path: ["page"], message: "page must be out of range" });
  }
});

export const publicSearchResponseSchema = z.union([
  emptyQueryResponseSchema,
  noResultsResponseSchema,
  resultsResponseSchema,
  outOfRangeResponseSchema,
]);

export const invalidPublicSearchQueryResponseSchema = z.object({
  error: z.literal("invalid_search_query"),
}).strict();

export const invalidPublicSearchPageResponseSchema = z.object({
  error: z.literal("invalid_search_page"),
}).strict();

export const publicSearchUnavailableResponseSchema = z.object({
  error: z.literal("search_unavailable"),
}).strict();

export const publicDiscoveryInternalErrorResponseSchema = z.object({
  error: z.literal("discovery_error"),
}).strict();

export const publicRelatedPostsResponseSchema = z.object({
  items: z.array(publicPostListItemSchema).max(publicRelatedPostLimit),
}).strict();

export type PublicSearchQuery = z.infer<typeof publicSearchQuerySchema>;
export type PublicSearchResponse = z.infer<typeof publicSearchResponseSchema>;
export type PublicRelatedPostsResponse = z.infer<typeof publicRelatedPostsResponseSchema>;
