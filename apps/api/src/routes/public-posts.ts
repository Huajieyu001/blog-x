import {
  invalidPublicSearchPageResponseSchema,
  invalidPublicSearchQueryResponseSchema,
  invalidPublicPageResponseSchema,
  publicDiscoveryInternalErrorResponseSchema,
  publicDistributionSchema,
  publicPostDetailSchema,
  publicPostNotFoundResponseSchema,
  publicPostPageQuerySchema,
  publicRelatedPostsResponseSchema,
  publicSearchPageSize,
  publicSearchQuerySchema,
  publicSearchResponseSchema,
  publicSearchUnavailableResponseSchema,
} from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import { renderMarkdown } from "../content/markdown.js";
import { SearchUnavailableError, type PublicRepository } from "../content/public-repository.js";

type PublicPostRouteOptions = {
  publicRepository: PublicRepository;
};

export const publicPostRoutes: FastifyPluginAsync<PublicPostRouteOptions> = async (app, options) => {
  app.get("/public/distribution", async () => publicDistributionSchema.parse(await options.publicRepository.distribution()));

  app.get<{ Querystring: Record<string, unknown> }>("/public/search", async (request, reply) => {
    const query = publicSearchQuerySchema.safeParse(request.query);
    if (!query.success) {
      const pageOnlyFailure = query.error.issues.length > 0
        && query.error.issues.every((issue) => issue.path[0] === "page");
      return pageOnlyFailure
        ? reply.code(400).send(invalidPublicSearchPageResponseSchema.parse({ error: "invalid_search_page" }))
        : reply.code(400).send(invalidPublicSearchQueryResponseSchema.parse({ error: "invalid_search_query" }));
    }
    if (query.data.q.length === 0) {
      return publicSearchResponseSchema.parse({
        state: "empty_query",
        query: "",
        page: query.data.page,
        pageSize: publicSearchPageSize,
        totalItems: 0,
        totalPages: 0,
        items: [],
      });
    }
    try {
      return publicSearchResponseSchema.parse(await options.publicRepository.searchPage(query.data.q, query.data.page));
    } catch (error) {
      if (error instanceof SearchUnavailableError) {
        return reply.code(503).send(publicSearchUnavailableResponseSchema.parse({ error: "search_unavailable" }));
      }
      return reply.code(500).send(publicDiscoveryInternalErrorResponseSchema.parse({ error: "discovery_error" }));
    }
  });

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
    const rendered = await renderMarkdown(markdown);
    return publicPostDetailSchema.parse({
      ...metadata,
      renderedHtml: rendered.html,
      toc: rendered.toc,
    });
  });

  app.get<{ Params: { slug: string } }>("/public/articles/:slug/related", async (request, reply) => {
    try {
      const related = await options.publicRepository.relatedBySlug(request.params.slug);
      if (!related) {
        return reply.code(404).send(publicPostNotFoundResponseSchema.parse({ error: "not_found" }));
      }
      return publicRelatedPostsResponseSchema.parse(related);
    } catch {
      return reply.code(500).send(publicDiscoveryInternalErrorResponseSchema.parse({ error: "discovery_error" }));
    }
  });
};
