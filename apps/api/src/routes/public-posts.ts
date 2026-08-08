import {
  invalidPublicPageResponseSchema,
  publicPostDetailSchema,
  publicPostNotFoundResponseSchema,
  publicPostPageQuerySchema,
} from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import { renderMarkdown } from "../content/markdown.js";
import type { PublicRepository } from "../content/public-repository.js";

type PublicPostRouteOptions = {
  publicRepository: PublicRepository;
};

export const publicPostRoutes: FastifyPluginAsync<PublicPostRouteOptions> = async (app, options) => {
  app.get<{ Querystring: Record<string, unknown> }>("/public/articles", async (request, reply) => {
    const query = publicPostPageQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send(invalidPublicPageResponseSchema.parse({ error: "invalid_page" }));
    }
    return options.publicRepository.listPage(query.data.page);
  });

  app.get<{ Params: { slug: string } }>("/public/articles/:slug", async (request, reply) => {
    const article = await options.publicRepository.findDetailBySlug(request.params.slug);
    if (!article) {
      return reply.code(404).send(publicPostNotFoundResponseSchema.parse({ error: "not_found" }));
    }
    const { markdown, ...metadata } = article;
    return publicPostDetailSchema.parse({
      ...metadata,
      renderedHtml: await renderMarkdown(markdown),
    });
  });
};
