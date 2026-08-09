import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sessionCookieName, type SessionService } from "../auth/sessions.js";
import type { ExportRepository } from "../content/export-repository.js";

type AdminExportRouteOptions = {
  exportRepository: ExportRepository;
  sessionAuth: SessionService;
  publicOrigin?: string;
};

export const adminExportRoutes: FastifyPluginAsync<AdminExportRouteOptions> = async (app, options) => {
  async function guard(request: FastifyRequest, reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown }; header: (name: string, value: string) => unknown }) {
    reply.header("cache-control", "no-store");
    if (!await options.sessionAuth.administratorIdForToken(request.cookies[sessionCookieName])) {
      reply.code(401).send({ error: "unauthorized" });
      return false;
    }
    return true;
  }

  app.post("/admin/export", async (request, reply) => {
    if (!await guard(request, reply)) return;
    if (!options.publicOrigin || request.headers.origin !== options.publicOrigin) return reply.code(403).send({ error: "forbidden" });
    const archive = await options.exportRepository.archive();
    reply.header("content-disposition", 'attachment; filename="blog-x-export-v1.json"');
    reply.type("application/json; charset=utf-8");
    return archive;
  });
};
