import { adminAnalyticsQuerySchema, adminAnalyticsResponseSchema } from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { SessionService } from "../auth/sessions.js";
import type { AdminAnalyticsRepository } from "../content/admin-analytics-repository.js";
import { requireAdministrator } from "../security/mutation-guard.js";

type Options = { adminAnalyticsRepository: AdminAnalyticsRepository; sessionAuth: SessionService };

export const adminAnalyticsRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  // requireAdministrator deliberately installs its generic no-store header. This
  // route needs the stronger exact private cache policy even for its 401 path.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("cache-control", "private, no-store, max-age=0");
    return payload;
  });
  app.get<{ Querystring: Record<string, string | string[] | undefined> }>("/admin/analytics.csv", async (request, reply) => {
    if (!await requireAdministrator(request, reply, { sessionAuth: options.sessionAuth })) return;
    const query = adminAnalyticsQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });
    try {
      const analytics = adminAnalyticsResponseSchema.parse(await options.adminAnalyticsRepository.read(query.data));
      reply.header("content-disposition", `attachment; filename="blog-x-daily-pv-${analytics.range}d.csv"`);
      reply.type("text/csv; charset=utf-8");
      return reply.send(`date,pv\n${analytics.daily.map((point) => `${point.day},${point.pv}`).join("\n")}\n`);
    } catch {
      return reply.code(503).send({ error: "analytics_unavailable" });
    }
  });
  app.get<{ Querystring: Record<string, string | string[] | undefined> }>("/admin/analytics", async (request, reply) => {
    // Set this before authentication so every possible outcome is private.
    reply.header("cache-control", "private, no-store, max-age=0");
    if (!await requireAdministrator(request, reply, { sessionAuth: options.sessionAuth })) return;
    const query = adminAnalyticsQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });
    try {
      const analytics = await options.adminAnalyticsRepository.read(query.data);
      return reply.send(adminAnalyticsResponseSchema.parse(analytics));
    } catch {
      return reply.code(503).send({ error: "analytics_unavailable" });
    }
  });
};
