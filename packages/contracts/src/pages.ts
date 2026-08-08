import { z } from "zod";
export const aboutInputSchema = z.object({ title: z.string().trim().min(1).max(160), markdown: z.string().max(200_000), version: z.string().datetime({ offset: true }).nullable().optional() }).strict();
export const adminAboutSchema = aboutInputSchema.extend({ id: z.uuid(), status: z.enum(["draft", "published"]), version: z.string().datetime({ offset: true }) }).strict();
export const publicAboutSchema = z.object({ title: z.string(), renderedHtml: z.string(), updatedAt: z.string().datetime({ offset: true }) }).strict();
export const archiveSchema = z.object({ years: z.array(z.object({ year: z.number().int(), months: z.array(z.object({ month: z.number().int(), items: z.array(z.object({ title: z.string(), slug: z.string(), publishedAt: z.string().datetime({ offset: true }) }).strict()) }).strict()) }).strict()) }).strict();
