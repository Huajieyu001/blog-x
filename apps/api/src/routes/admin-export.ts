import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { SessionService } from "../auth/sessions.js";
import type { ExportRepository } from "../content/export-repository.js";
import { requireAdministratorMutation, requireEmptyFormContent, type MutationGuardOptions } from "../security/mutation-guard.js";

type AdminExportRouteOptions = {
  exportRepository: ExportRepository;
  sessionAuth: SessionService;
  publicOrigin?: string;
  mutationGuard: MutationGuardOptions;
};

export const adminExportRoutes: FastifyPluginAsync<AdminExportRouteOptions> = async (app, options) => {
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  app.post<{ Body: string | undefined }>("/admin/export", { bodyLimit: 1024 }, async (request, reply) => {
    if (!await requireAdministratorMutation(request, reply, options.mutationGuard)) return;
    if (!requireEmptyFormContent(request, reply)) return;
    if (request.body !== undefined && request.body !== "") return reply.code(400).send({ error: "invalid_export_request" });
    const archive = await options.exportRepository.archive();
    reply.header("content-disposition", 'attachment; filename="blog-x-export-v1.json"');
    reply.type("application/json; charset=utf-8");
    return archive;
  });
};
