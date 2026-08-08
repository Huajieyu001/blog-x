import { z } from "zod";

export const taxonomyKindSchema = z.enum(["categories", "tags"]);
export const taxonomySlugSchema = z.string().trim().min(1).max(180).regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u).transform((value) => value.normalize("NFKC").toLocaleLowerCase("und"));
export const taxonomyInputSchema = z.object({ name: z.string().trim().min(1, "请输入名称").max(120, "名称不能超过 120 个字符"), slug: taxonomySlugSchema }).strict();
export const taxonomyTermSchema = z.object({ id: z.uuid(), name: z.string(), slug: z.string(), articleCount: z.number().int().nonnegative() }).strict();
export const publicTaxonomyTermSchema = taxonomyTermSchema.pick({ name: true, slug: true, articleCount: true }).strict();
export const taxonomyListSchema = z.object({ items: z.array(taxonomyTermSchema) }).strict();
export const publicTaxonomyListSchema = z.object({ items: z.array(publicTaxonomyTermSchema) }).strict();
export const taxonomyDeleteConflictSchema = z.object({ error: z.literal("associated_delete"), articleCount: z.number().int().positive() }).strict();
export type TaxonomyInput = z.infer<typeof taxonomyInputSchema>;
export type TaxonomyTerm = z.infer<typeof taxonomyTermSchema>;
