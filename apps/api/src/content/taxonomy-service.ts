import { taxonomyTermSchema, type TaxonomyInput } from "@blog-x/contracts";
import type { TaxonomyRepository } from "./taxonomy-repository.js";
type Kind = "categories" | "tags";
export function createTaxonomyService(repository: TaxonomyRepository) {
  const serialize = (row: { id: string; name: string; slug: string }, articleCount = 0) => taxonomyTermSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    articleCount,
  });
  return { list: async (kind: Kind) => ({ items: (await repository.list(kind)).map((row) => serialize(row, Number(row.articleCount))) }), create: async (kind: Kind, input: TaxonomyInput) => serialize(await repository.create(kind, input)), update: async (kind: Kind, id: string, input: TaxonomyInput) => { const row = await repository.update(kind, id, input); return row ? serialize(row) : null; }, remove: (kind: Kind, id: string) => repository.remove(kind, id) };
}
export type TaxonomyService = ReturnType<typeof createTaxonomyService>;
