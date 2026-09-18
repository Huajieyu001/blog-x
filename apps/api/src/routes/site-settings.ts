import { siteSettingsInputSchema, staleSiteSettingsVersionSchema } from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { SessionService } from "../auth/sessions.js";
import type { SiteSettingsService } from "../content/site-settings-service.js";
import { requireAdministrator, requireAdministratorMutation, requireContentType, type MutationGuardOptions } from "../security/mutation-guard.js";

type Options = { siteSettingsService: SiteSettingsService; sessionAuth: SessionService; mutationGuard: MutationGuardOptions };

export const siteSettingsRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get("/public/site-settings", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return options.siteSettingsService.getPublic();
  });
  app.get("/admin/site-settings", async (request, reply) => {
    if (!await requireAdministrator(request, reply, options.mutationGuard)) return;
    const settings = await options.siteSettingsService.getAdmin();
    return settings ?? reply.code(404).send({ error: "not_found" });
  });
  app.post("/admin/site-settings", { bodyLimit: 64 * 1024 }, async (request, reply) => {
    const actorAdministratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
    if (!actorAdministratorId) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = siteSettingsInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "validation_failed" });
    const result = await options.siteSettingsService.save(parsed.data, actorAdministratorId);
    return result.stale ? reply.code(409).send(staleSiteSettingsVersionSchema.parse({ error: "stale_version" })) : result.settings;
  });
};
