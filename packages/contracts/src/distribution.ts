import { z } from "zod";
import { publicTaxonomyTermSchema } from "./taxonomy";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const portableArticleStatusSchema = z.enum(["draft", "published", "unpublished"]);
const legacyMediaReviewSchema = z.enum(["pending", "clear", "review_required"]);
const portableTaxonomyTermSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();

const portableMediaReferenceSchema = z.object({
  id: z.uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  createdAt: isoDateTimeSchema,
}).strict();

const portableArticleSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  coverUrl: z.string(),
  slug: z.string(),
  markdown: z.string(),
  seoDescription: z.string(),
  status: portableArticleStatusSchema,
  publishedAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  categoryId: z.uuid().nullable(),
  tagIds: z.array(z.uuid()),
  coverMediaId: z.uuid().nullable(),
  coverAlt: z.string(),
  coverDecorative: z.boolean(),
  // Older portable v1 exports predate this lossless review disposition.
  legacyMediaReview: legacyMediaReviewSchema.optional(),
}).strict();

const portableAboutSchema = z.object({
  id: z.uuid(),
  key: z.literal("about"),
  title: z.string(),
  markdown: z.string(),
  status: z.enum(["draft", "published"]),
  version: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();

export const portableExportManifestSchema = z.object({
  format: z.literal("blog-x-portable-export"),
  version: z.literal(1),
  exportedAt: isoDateTimeSchema,
  articles: z.array(portableArticleSchema),
  categories: z.array(portableTaxonomyTermSchema),
  tags: z.array(portableTaxonomyTermSchema),
  media: z.array(portableMediaReferenceSchema),
  about: portableAboutSchema.nullable(),
}).strict();

export type PortableExportManifest = z.infer<typeof portableExportManifestSchema>;

const publicDistributionTermSchema = publicTaxonomyTermSchema.pick({ name: true, slug: true }).extend({
  articleCount: z.number().int().positive(),
}).strict();

const publicDistributionArticleSchema = z.object({
  title: z.string(),
  summary: z.string(),
  slug: z.string(),
  publishedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  category: publicTaxonomyTermSchema.pick({ name: true, slug: true }).nullable(),
  tags: z.array(publicTaxonomyTermSchema.pick({ name: true, slug: true })),
}).strict();

const publicDistributionAboutSchema = z.object({
  title: z.string(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export const publicDistributionSchema = z.object({
  articles: z.array(publicDistributionArticleSchema),
  categories: z.array(publicDistributionTermSchema),
  tags: z.array(publicDistributionTermSchema),
  about: publicDistributionAboutSchema.nullable(),
}).strict();

export type PublicDistribution = z.infer<typeof publicDistributionSchema>;
