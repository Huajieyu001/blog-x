import { z } from "zod";

const publishedAtSchema = z.string().datetime({ offset: true });

export const publishInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  markdown: z.string().trim().min(1).max(200_000),
}).strict();

export const publishedArticleSchema = z.object({
  title: z.string(),
  slug: z.string(),
  publishedAt: publishedAtSchema,
}).strict();

export const publicArticleListSchema = z.array(publishedArticleSchema);

export const publicArticleDetailSchema = publishedArticleSchema.extend({
  html: z.string(),
}).strict();

export type PublishInput = z.infer<typeof publishInputSchema>;
export type PublishedArticle = z.infer<typeof publishedArticleSchema>;
export type PublicArticleDetail = z.infer<typeof publicArticleDetailSchema>;
