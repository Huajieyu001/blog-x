import { invalidPublicPageResponseSchema, publicPostPageQuerySchema, publicTaxonomyListSchema, publicTaxonomyTermSchema } from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { TaxonomyRepository } from "../content/taxonomy-repository.js";
type Options = { taxonomyRepository: TaxonomyRepository };
export const publicTaxonomyRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  for (const kind of ["categories", "tags"] as const) {
    app.get(`/public/${kind}`, async () => publicTaxonomyListSchema.parse({ items: (await options.taxonomyRepository.list(kind, true)).map((row) => publicTaxonomyTermSchema.parse({ id: row.id, name: row.name, slug: row.slug, articleCount: Number(row.articleCount) })) }));
    app.get<{ Params: { slug: string }; Querystring: Record<string, unknown> }>(`/public/${kind}/:slug/articles`, async (request, reply) => { const query = publicPostPageQuerySchema.safeParse(request.query); if (!query.success) return reply.code(400).send(invalidPublicPageResponseSchema.parse({ error: "invalid_page" })); const result = await options.taxonomyRepository.publicArticles(kind, request.params.slug, query.data.page); if (!result) return reply.code(404).send({ error: "not_found" }); return { term: publicTaxonomyTermSchema.parse({ id: result.term.id, name: result.term.name, slug: result.term.slug, articleCount: 0 }), posts: result.posts }; });
  }
};
