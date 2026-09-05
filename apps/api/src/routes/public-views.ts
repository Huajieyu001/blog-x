import {
  anonymousViewBodySchema,
  anonymousViewSlugParamsSchema,
} from "@blog-x/contracts";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { ViewAggregationRepository } from "../content/view-aggregation-repository.js";
import { classifyAnonymousViewRequest } from "../analytics/view-request-policy.js";
import { BoundedRateLimitStore, createRateLimitKey, type RateLimitPolicy } from "../security/rate-limiter.js";

type PublicViewRouteOptions = {
  publicOrigin?: string;
  viewAggregationRepository: ViewAggregationRepository;
  rateStore?: BoundedRateLimitStore;
  ratePolicy?: RateLimitPolicy;
};

export const anonymousViewRatePolicy: RateLimitPolicy = Object.freeze({ limit: 120, windowMs: 60_000 });

function opaqueViewResponse(reply: FastifyReply) {
  return reply.header("cache-control", "no-store").code(204).send();
}

export const publicViewRoutes: FastifyPluginAsync<PublicViewRouteOptions> = async (app, options) => {
  const rateStore = options.rateStore ?? new BoundedRateLimitStore();
  const ratePolicy = options.ratePolicy ?? anonymousViewRatePolicy;
  app.setErrorHandler((_error, _request, reply) => opaqueViewResponse(reply));

  app.post<{ Params: Record<string, unknown>; Body: unknown }>("/public/articles/:slug/view", { bodyLimit: 256, logLevel: "silent" }, async (request, reply) => {
    try {
      const params = anonymousViewSlugParamsSchema.safeParse(request.params);
      const body = anonymousViewBodySchema.safeParse(request.body);
      const header = (value: unknown) => typeof value === "string" ? value : undefined;
      const decision = classifyAnonymousViewRequest({
        origin: header(request.headers.origin),
        purpose: header(request.headers.purpose),
        secPurpose: header(request.headers["sec-purpose"]),
        nextRouterPrefetch: header(request.headers["next-router-prefetch"]),
        referer: header(request.headers.referer),
        userAgent: header(request.headers["user-agent"]),
      }, options.publicOrigin ?? "");
      if (!params.success || !body.success || !decision.accepted) return opaqueViewResponse(reply);
      if (!rateStore.consume(createRateLimitKey("anonymous-view", request.ip), ratePolicy).allowed) return opaqueViewResponse(reply);
      await options.viewAggregationRepository.recordPublicView(params.data.slug, decision.source);
      return opaqueViewResponse(reply);
    } catch {
      return opaqueViewResponse(reply);
    }
  });
};
