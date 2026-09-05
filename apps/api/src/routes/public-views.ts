import {
  anonymousViewBodySchema,
  anonymousViewSlugParamsSchema,
} from "@blog-x/contracts";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { ViewAggregationRepository } from "../content/view-aggregation-repository.js";

type PublicViewRouteOptions = {
  publicOrigin?: string;
  viewAggregationRepository: ViewAggregationRepository;
};

function opaqueViewResponse(reply: FastifyReply) {
  return reply.header("cache-control", "no-store").code(204).send();
}

export const publicViewRoutes: FastifyPluginAsync<PublicViewRouteOptions> = async (app, options) => {
  app.setErrorHandler((_error, _request, reply) => opaqueViewResponse(reply));

  app.post<{ Params: Record<string, unknown>; Body: unknown }>("/public/articles/:slug/view", { bodyLimit: 256 }, async (request, reply) => {
    try {
      const params = anonymousViewSlugParamsSchema.safeParse(request.params);
      const body = anonymousViewBodySchema.safeParse(request.body);
      if (request.headers.origin !== options.publicOrigin || !params.success || !body.success) return opaqueViewResponse(reply);
      await options.viewAggregationRepository.recordPublicView(params.data.slug, "direct");
      return opaqueViewResponse(reply);
    } catch {
      return opaqueViewResponse(reply);
    }
  });
};
