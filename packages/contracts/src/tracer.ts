import { z } from "zod";

const publishedAtSchema = z.string().datetime({ offset: true });

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(1024),
}).strict();

export const loginResponseSchema = z.object({ ok: z.literal(true) }).strict();

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

export type LoginInput = z.infer<typeof loginInputSchema>;
export type PublishInput = z.infer<typeof publishInputSchema>;
export type PublishedArticle = z.infer<typeof publishedArticleSchema>;
export type PublicArticleDetail = z.infer<typeof publicArticleDetailSchema>;
