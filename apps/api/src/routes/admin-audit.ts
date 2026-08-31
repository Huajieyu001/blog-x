import { auditEventQuerySchema } from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { SessionService } from "../auth/sessions.js";
import { decodeAuditCursor, type AuditRepository } from "../audit/audit-repository.js";
import { requireAdministrator } from "../security/mutation-guard.js";

type Options = { auditRepository: AuditRepository; sessionAuth: SessionService };

export const adminAuditRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get<{ Querystring: { cursor?: string; limit?: string } }>("/admin/audit-events", async (request, reply) => {
    if (!await requireAdministrator(request, reply, { sessionAuth: options.sessionAuth })) return;
    const query = auditEventQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });
    try {
      return await options.auditRepository.list({
        limit: query.data.limit,
        ...(query.data.cursor ? { cursor: decodeAuditCursor(query.data.cursor) } : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "invalid audit cursor") {
        return reply.code(400).send({ error: "invalid_cursor" });
      }
      throw error;
    }
  });
};
