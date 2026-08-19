import { aboutInputSchema, aboutPreviewSchema, aboutVersionSchema, staleVersionSchema } from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { SessionService } from "../auth/sessions.js";
import { renderMarkdown } from "../content/markdown.js";
import type { PageService } from "../content/page-service.js";
import { requireAdministrator, requireAdministratorMutation, requireContentType, type MutationGuardOptions } from "../security/mutation-guard.js";

type Options = { pageService: PageService; sessionAuth: SessionService; publicOrigin?: string; mutationGuard: MutationGuardOptions };

export const pageRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get("/admin/about", async (request, reply) => {
    if (!await requireAdministrator(request, reply, options.mutationGuard)) return;
    const page = await options.pageService.get();
    return page ?? reply.code(404).send({ error: "not_found" });
  });
  app.post("/admin/about", { bodyLimit: 256 * 1024 }, async (request, reply) => {
    if (!await requireAdministratorMutation(request, reply, options.mutationGuard)) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = aboutInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "validation_failed" });
    const result = await options.pageService.save(parsed.data);
    return result.stale ? reply.code(409).send(staleVersionSchema.parse({ error: "stale_version" })) : result.page;
  });
  app.post("/admin/about/preview", { bodyLimit: 256 * 1024 }, async (request, reply) => {
    if (!await requireAdministratorMutation(request, reply, options.mutationGuard)) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = aboutInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "validation_failed" });
    return aboutPreviewSchema.parse({ html: (await renderMarkdown(parsed.data.markdown)).html });
  });
  app.post("/admin/about/publish", { bodyLimit: 64 * 1024 }, async (request, reply) => {
    if (!await requireAdministratorMutation(request, reply, options.mutationGuard)) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = aboutVersionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "validation_failed" });
    const result = await options.pageService.publish(parsed.data.version);
    return !result ? reply.code(404).send({ error: "not_found" }) : result.stale ? reply.code(409).send(staleVersionSchema.parse({ error: "stale_version" })) : result.page;
  });
};
