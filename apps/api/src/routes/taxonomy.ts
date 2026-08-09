import { fieldErrorResponseSchema, taxonomyDeleteConflictSchema, taxonomyInputSchema, taxonomyKindSchema, taxonomyListSchema, taxonomyTermSchema } from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { SessionService } from "../auth/sessions.js";
import type { TaxonomyService } from "../content/taxonomy-service.js";
import { requireAdministrator, requireAdministratorMutation, requireContentType, type MutationGuardOptions } from "../security/mutation-guard.js";

type Options = { taxonomyService: TaxonomyService; sessionAuth: SessionService; publicOrigin?: string; mutationGuard: MutationGuardOptions };
function errors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) { const fields: Record<string, string[]> = {}; for (const issue of error.issues) (fields[String(issue.path[0] ?? "form")] ??= []).push(issue.message); return fieldErrorResponseSchema.parse({ error: "validation_failed", fields }); }
function conflict(error: unknown) { return typeof error === "object" && error !== null && ((error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505"); }

export const taxonomyRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const kind = (value: string) => taxonomyKindSchema.safeParse(value);
  app.get<{ Params: { kind: string } }>("/admin/:kind(categories|tags)", async (request, reply) => {
    if (!await requireAdministrator(request, reply, options.mutationGuard)) return;
    const parsed = kind(request.params.kind);
    if (!parsed.success) return reply.code(404).send({ error: "not_found" });
    return taxonomyListSchema.parse(await options.taxonomyService.list(parsed.data));
  });
  app.post<{ Params: { kind: string } }>("/admin/:kind(categories|tags)", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    if (!await requireAdministratorMutation(request, reply, options.mutationGuard)) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsedKind = kind(request.params.kind);
    const parsed = taxonomyInputSchema.safeParse(request.body);
    if (!parsedKind.success) return reply.code(404).send({ error: "not_found" });
    if (!parsed.success) return reply.code(400).send(errors(parsed.error));
    try { return reply.code(201).send(taxonomyTermSchema.parse(await options.taxonomyService.create(parsedKind.data, parsed.data))); }
    catch (error) { if (conflict(error)) return reply.code(409).send({ error: "slug_conflict" }); throw error; }
  });
  app.put<{ Params: { kind: string; id: string } }>("/admin/:kind(categories|tags)/:id", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    if (!await requireAdministratorMutation(request, reply, options.mutationGuard)) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsedKind = kind(request.params.kind);
    const parsed = taxonomyInputSchema.safeParse(request.body);
    if (!parsedKind.success || !/^[\da-f-]{36}$/i.test(request.params.id)) return reply.code(404).send({ error: "not_found" });
    if (!parsed.success) return reply.code(400).send(errors(parsed.error));
    try { const term = await options.taxonomyService.update(parsedKind.data, request.params.id, parsed.data); return term ?? reply.code(404).send({ error: "not_found" }); }
    catch (error) { if (conflict(error)) return reply.code(409).send({ error: "slug_conflict" }); throw error; }
  });
  app.delete<{ Params: { kind: string; id: string } }>("/admin/:kind(categories|tags)/:id", { bodyLimit: 1 }, async (request, reply) => {
    if (!await requireAdministratorMutation(request, reply, options.mutationGuard)) return;
    const parsedKind = kind(request.params.kind);
    if (!parsedKind.success) return reply.code(404).send({ error: "not_found" });
    const result = await options.taxonomyService.remove(parsedKind.data, request.params.id);
    if (!result) return reply.code(404).send({ error: "not_found" });
    if (!result.deleted) return reply.code(409).send(taxonomyDeleteConflictSchema.parse({ error: "associated_delete", articleCount: result.articleCount }));
    return reply.code(204).send();
  });
};
