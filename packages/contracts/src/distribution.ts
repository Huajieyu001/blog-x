import { z } from "zod";
import { publicTaxonomyTermSchema } from "./taxonomy";

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
