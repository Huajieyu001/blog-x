import {
  adminPostInputSchema,
  adminPostIdSchema,
  adminPostListSchema,
  adminPostPreviewInputSchema,
  adminPostPreviewSchema,
  adminPostUpdateSchema,
  articleActionSchema,
  deletedArticleSchema,
  fieldErrorResponseSchema,
  invalidTransitionResponseSchema,
  lifecycleActionInputSchema,
  publishedSlugConfirmationRequiredSchema,
  scheduleArticleInputSchema,
  scheduleConflictResponseSchema,
  slugConflictResponseSchema,
  slugSuggestionSchema,
  suggestSlug,
} from "@blog-x/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { SessionService } from "../auth/sessions.js";
import type { ArticleService, ArticleServiceResult, DeleteServiceResult } from "../content/article-service.js";
import { renderMarkdown } from "../content/markdown.js";
import { requireAdministrator, requireAdministratorMutation, requireContentType, requireEmptyFormContent, type MutationGuardOptions } from "../security/mutation-guard.js";

type AdminPostRouteOptions = {
  articleService: ArticleService;
  sessionAuth: SessionService;
  publicOrigin?: string;
  mutationGuard: MutationGuardOptions;
};

function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? "form");
    (fields[name] ??= []).push(issue.message);
  }
  return fieldErrorResponseSchema.parse({ error: "validation_failed", fields });
}

function isSlugConflict(error: unknown) {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function isForeignKeyConflict(error: unknown) {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ((current as { code?: string }).code === "23503") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function invalidTaxonomy(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) {
  return reply.code(400).send(fieldErrorResponseSchema.parse({
    error: "validation_failed",
    fields: { taxonomy: ["所选分类或标签不存在"] },
  }));
}

function sendServiceResult(result: ArticleServiceResult | DeleteServiceResult, reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) {
  if (result.ok) {
    if ("deleted" in result) return deletedArticleSchema.parse(result.deleted);
    return result.post;
  }
  if (result.detail.error === "not_found") return reply.code(404).send({ error: "not_found" });
  if (result.detail.error === "validation_failed") return reply.code(400).send(fieldErrorResponseSchema.parse(result.detail));
  if (result.detail.error === "schedule_conflict") return reply.code(409).send(scheduleConflictResponseSchema.parse(result.detail));
  if (result.detail.error === "invalid_transition") return reply.code(409).send(invalidTransitionResponseSchema.parse(result.detail));
  return reply.code(409).send(publishedSlugConfirmationRequiredSchema.parse(result.detail));
}

function invalidScheduleForm(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) {
  return reply.code(400).send(fieldErrorResponseSchema.parse({
    error: "validation_failed",
    fields: { scheduledAt: ["预约时间必须是含明确 UTC 偏移量的本地日期时间"] },
  }));
}

function parseScheduleForm(body: unknown) {
  if (typeof body !== "string") return null;
  const form = new URLSearchParams(body);
  const allowed = new Set(["scheduledAt", "timezoneOffset"]);
  const entries = [...form.entries()];
  if (entries.length !== 2 || entries.some(([key]) => !allowed.has(key))) return null;
  const local = form.get("scheduledAt");
  const offset = form.get("timezoneOffset");
  if (!local || !offset || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(local) || !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset)) return null;
  const seconds = local.length === 16 ? `${local}:00` : local;
  const parsed = scheduleArticleInputSchema.safeParse({ scheduledAt: `${seconds}${offset}` });
  return parsed.success ? parsed.data : null;
}

export const adminPostRoutes: FastifyPluginAsync<AdminPostRouteOptions> = async (app, options) => {
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });
  app.get<{ Querystring: { title?: string } }>("/admin/posts/slug-suggestion", async (request, reply) => {
    if (!await requireAdministrator(request, reply, options.mutationGuard)) return;
    return slugSuggestionSchema.parse({ slug: suggestSlug(request.query.title ?? "") });
  });

  app.post("/admin/posts/preview", { bodyLimit: 256 * 1024 }, async (request, reply) => {
    if (!await requireAdministratorMutation(request, reply, options.mutationGuard)) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = adminPostPreviewInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fieldErrors(parsed.error));
    return adminPostPreviewSchema.parse({ html: (await renderMarkdown(parsed.data.markdown)).html });
  });

  app.post("/admin/posts", { bodyLimit: 256 * 1024 }, async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
    if (!administratorId) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = adminPostInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fieldErrors(parsed.error));
    try {
      const result = await options.articleService.createDraft(parsed.data, administratorId);
      if (!result.ok) return sendServiceResult(result, reply);
      const post = result.post;
      reply.header("location", `/admin/posts/${post.id}`);
      return reply.code(201).send(post);
    } catch (error) {
      if (isSlugConflict(error)) return reply.code(409).send(slugConflictResponseSchema.parse({ error: "slug_conflict", fields: { slug: ["Slug 已被占用"] } }));
      if (isForeignKeyConflict(error)) return invalidTaxonomy(reply);
      throw error;
    }
  });

  app.get("/admin/posts", async (request, reply) => {
    if (!await requireAdministrator(request, reply, options.mutationGuard)) return;
    return adminPostListSchema.parse(await options.articleService.listDrafts());
  });

  app.get<{ Params: { id: string } }>("/admin/posts/:id", async (request, reply) => {
    if (!await requireAdministrator(request, reply, options.mutationGuard)) return;
    const id = adminPostIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send({ error: "not_found" });
    const post = await options.articleService.getDraft(id.data);
    if (!post) return reply.code(404).send({ error: "not_found" });
    return post;
  });

  app.put<{ Params: { id: string } }>("/admin/posts/:id", { bodyLimit: 256 * 1024 }, async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
    if (!administratorId) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const id = adminPostIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send({ error: "not_found" });
    const parsed = adminPostUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fieldErrors(parsed.error));
    try {
      return sendServiceResult(await options.articleService.updateDraft(id.data, parsed.data, administratorId), reply);
    } catch (error) {
      if (isSlugConflict(error)) return reply.code(409).send(slugConflictResponseSchema.parse({ error: "slug_conflict", fields: { slug: ["Slug 已被占用"] } }));
      if (isForeignKeyConflict(error)) return invalidTaxonomy(reply);
      throw error;
    }
  });

  app.put<{ Params: { id: string } }>("/admin/posts/:id/schedule", { bodyLimit: 4 * 1024 }, async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
    if (!administratorId) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const id = adminPostIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send({ error: "not_found" });
    const parsed = scheduleArticleInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fieldErrors(parsed.error));
    return sendServiceResult(await options.articleService.schedule(id.data, parsed.data, administratorId), reply);
  });

  app.delete<{ Params: { id: string } }>("/admin/posts/:id/schedule", { bodyLimit: 1 }, async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
    if (!administratorId) return;
    if (request.headers["content-type"] !== undefined || request.body !== undefined) return reply.code(415).send({ error: "unsupported_media_type" });
    const id = adminPostIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send({ error: "not_found" });
    return sendServiceResult(await options.articleService.cancelSchedule(id.data, administratorId), reply);
  });

  // Native forms can only submit POST. These aliases deliberately preserve the
  // stricter JSON semantic API above while providing a no-script, same-origin
  // schedule path with an explicit author-supplied UTC offset.
  app.post<{ Params: { id: string }; Body: string | undefined }>("/admin/posts/:id/schedule", { bodyLimit: 4 * 1024 }, async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
    if (!administratorId) return;
    if (!requireContentType(request, reply, "application/x-www-form-urlencoded")) return;
    const id = adminPostIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send({ error: "not_found" });
    const parsed = parseScheduleForm(request.body);
    if (!parsed) return invalidScheduleForm(reply);
    const result = await options.articleService.schedule(id.data, parsed, administratorId);
    if (result.ok && !request.headers.accept?.includes("application/json")) return reply.redirect(`/admin/posts/${id.data}`);
    return sendServiceResult(result, reply);
  });

  app.post<{ Params: { id: string }; Body: string | undefined }>("/admin/posts/:id/schedule/cancel", { bodyLimit: 1 }, async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
    if (!administratorId) return;
    if (!requireEmptyFormContent(request, reply)) return;
    if (request.body !== undefined && request.body !== "") return reply.code(400).send({ error: "validation_failed" });
    const id = adminPostIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send({ error: "not_found" });
    const result = await options.articleService.cancelSchedule(id.data, administratorId);
    if (result.ok && !request.headers.accept?.includes("application/json")) return reply.redirect(`/admin/posts/${id.data}`);
    return sendServiceResult(result, reply);
  });

  for (const action of articleActionSchema.options) {
    app.post<{ Params: { id: string } }>(`/admin/posts/:id/${action}`, { bodyLimit: 64 * 1024 }, async (request, reply) => {
      const administratorId = await requireAdministratorMutation(request, reply, options.mutationGuard);
      if (!administratorId) return;
      if (!requireContentType(request, reply, "application/json")) return;
      const id = adminPostIdSchema.safeParse(request.params.id);
      if (!id.success) return reply.code(404).send({ error: "not_found" });
      const input = lifecycleActionInputSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(fieldErrors(input.error));
      return sendServiceResult(await options.articleService.transition(id.data, action, administratorId), reply);
    });
  }
};
