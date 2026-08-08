import {
  invalidPublicPageResponseSchema,
  publicPostPageQuerySchema,
} from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
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
};

