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
  slugConflictResponseSchema,
  slugSuggestionSchema,
  suggestSlug,
} from "@blog-x/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sessionCookieName, type SessionService } from "../auth/sessions.js";
import type { ArticleService, ArticleServiceResult, DeleteServiceResult } from "../content/article-service.js";
import { renderMarkdown } from "../content/markdown.js";

type AdminPostRouteOptions = {
  articleService: ArticleService;
  sessionAuth: SessionService;
  publicOrigin?: string;
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

function sendServiceResult(result: ArticleServiceResult | DeleteServiceResult, reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) {
  if (result.ok) {
    if ("deleted" in result) return deletedArticleSchema.parse(result.deleted);
    return result.post;
  }
  if (result.detail.error === "not_found") return reply.code(404).send({ error: "not_found" });
  if (result.detail.error === "validation_failed") return reply.code(400).send(fieldErrorResponseSchema.parse(result.detail));
  if (result.detail.error === "invalid_transition") return reply.code(409).send(invalidTransitionResponseSchema.parse(result.detail));
  return reply.code(409).send(publishedSlugConfirmationRequiredSchema.parse(result.detail));
}

export const adminPostRoutes: FastifyPluginAsync<AdminPostRouteOptions> = async (app, options) => {
  async function guard(request: FastifyRequest, reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown }; header: (name: string, value: string) => unknown }) {
    reply.header("cache-control", "no-store");
    if (!await options.sessionAuth.administratorIdForToken(request.cookies[sessionCookieName])) {
      reply.code(401).send({ error: "unauthorized" });
      return false;
    }
    return true;
  }

  function trustedOrigin(request: FastifyRequest) {
    return Boolean(options.publicOrigin) && request.headers.origin === options.publicOrigin;
  }

  app.get<{ Querystring: { title?: string } }>("/admin/posts/slug-suggestion", async (request, reply) => {
    if (!await guard(request, reply)) return;
    return slugSuggestionSchema.parse({ slug: suggestSlug(request.query.title ?? "") });
  });

  app.post("/admin/posts/preview", async (request, reply) => {
    if (!await guard(request, reply)) return;
    if (!trustedOrigin(request)) return reply.code(403).send({ error: "forbidden" });
    const parsed = adminPostPreviewInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fieldErrors(parsed.error));
    return adminPostPreviewSchema.parse({ html: await renderMarkdown(parsed.data.markdown) });
  });

  app.post("/admin/posts", async (request, reply) => {
    if (!await guard(request, reply)) return;
    if (!trustedOrigin(request)) return reply.code(403).send({ error: "forbidden" });
    const parsed = adminPostInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fieldErrors(parsed.error));
    try {
      const post = await options.articleService.createDraft(parsed.data);
      reply.header("location", `/admin/posts/${post.id}`);
      return reply.code(201).send(post);
    } catch (error) {
      if (isSlugConflict(error)) return reply.code(409).send(slugConflictResponseSchema.parse({ error: "slug_conflict", fields: { slug: ["Slug 已被占用"] } }));
      throw error;
    }
  });

  app.get("/admin/posts", async (request, reply) => {
    if (!await guard(request, reply)) return;
    return adminPostListSchema.parse(await options.articleService.listDrafts());
  });

  app.get<{ Params: { id: string } }>("/admin/posts/:id", async (request, reply) => {
    if (!await guard(request, reply)) return;
    const id = adminPostIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send({ error: "not_found" });
    const post = await options.articleService.getDraft(id.data);
    if (!post) return reply.code(404).send({ error: "not_found" });
    return post;
  });

  app.put<{ Params: { id: string } }>("/admin/posts/:id", async (request, reply) => {
    if (!await guard(request, reply)) return;
    if (!trustedOrigin(request)) return reply.code(403).send({ error: "forbidden" });
    const id = adminPostIdSchema.safeParse(request.params.id);
    if (!id.success) return reply.code(404).send({ error: "not_found" });
    const parsed = adminPostUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fieldErrors(parsed.error));
    try {
      return sendServiceResult(await options.articleService.updateDraft(id.data, parsed.data), reply);
    } catch (error) {
      if (isSlugConflict(error)) return reply.code(409).send(slugConflictResponseSchema.parse({ error: "slug_conflict", fields: { slug: ["Slug 已被占用"] } }));
      throw error;
    }
  });

  for (const action of articleActionSchema.options) {
    app.post<{ Params: { id: string } }>(`/admin/posts/:id/${action}`, async (request, reply) => {
      if (!await guard(request, reply)) return;
      if (!trustedOrigin(request)) return reply.code(403).send({ error: "forbidden" });
      const id = adminPostIdSchema.safeParse(request.params.id);
      if (!id.success) return reply.code(404).send({ error: "not_found" });
      const input = lifecycleActionInputSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(fieldErrors(input.error));
      return sendServiceResult(await options.articleService.transition(id.data, action), reply);
    });
  }
};
