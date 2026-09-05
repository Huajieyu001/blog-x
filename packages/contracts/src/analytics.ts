import { z } from "zod";

export const anonymousViewSourceValues = ["direct", "internal", "search", "social", "external"] as const;
export const anonymousViewSourceSchema = z.enum(anonymousViewSourceValues);
export const anonymousViewSlugParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
}).strict();
export const anonymousViewBodySchema = z.object({}).strict();

export type AnonymousViewSource = z.infer<typeof anonymousViewSourceSchema>;
