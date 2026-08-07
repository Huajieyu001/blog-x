import {
  adminPostInputSchema,
  adminPostSchema,
  articleStatusSchema,
  type AdminPost,
  type AdminPostInput,
  type AdminPostUpdateInput,
  type ArticleAction,
  type ArticleStatus,
} from "@blog-x/contracts";
import type { AdminPostRepository, StoredAdminPost } from "./admin-repository.js";
import { resolveRetainedTransition } from "./article-state.js";

export type ArticleServiceError =
  | { error: "not_found" }
  | { error: "invalid_transition"; status: ArticleStatus; action: ArticleAction }
  | { error: "validation_failed"; fields: Record<string, string[]> }
  | { error: "published_slug_confirmation_required"; currentSlug: string; requestedSlug: string; version: string };

export type ArticleServiceResult = { ok: true; post: AdminPost } | { ok: false; detail: ArticleServiceError };
export type DeleteServiceResult = { ok: true; deleted: { id: string; deleted: true } } | { ok: false; detail: ArticleServiceError };

function serialize(post: StoredAdminPost): AdminPost {
  const { updatedAt, ...wirePost } = post;
  return adminPostSchema.parse({
    ...wirePost,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    version: updatedAt.toISOString(),
  });
}

function validationFields(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? "form");
    (fields[name] ??= []).push(issue.message);
  }
  return fields;
}

function statusOf(post: StoredAdminPost) {
  return articleStatusSchema.parse(post.status);
}

function nextVersion(current: StoredAdminPost) {
  return new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
}

function confirmationMatches(id: string, current: StoredAdminPost, input: AdminPostUpdateInput) {
  return input.slugChangeConfirmation?.articleId === id
    && input.slugChangeConfirmation.currentSlug === current.slug
    && input.slugChangeConfirmation.version === current.updatedAt.toISOString();
}

export function createArticleService(repository: AdminPostRepository) {
  async function createDraft(input: AdminPostInput) {
    const post = await repository.createDraft(input);
    if (!post) throw new Error("draft was not persisted");
    return serialize(post);
  }

  async function getDraft(id: string) {
    const post = await repository.findRetainedById(id);
    return post ? serialize(post) : null;
  }

  async function listDrafts() {
    return Promise.all((await repository.listRetained()).map(serialize));
  }

  async function updateDraft(id: string, input: AdminPostUpdateInput): Promise<ArticleServiceResult> {
    const result = await repository.transactRetained<ArticleServiceResult>(id, async (current, update) => {
      const status = statusOf(current);
      if (!resolveRetainedTransition(status, "edit")) return { ok: false, detail: { error: "not_found" } };
      if (status === "published" && input.slug !== current.slug && !confirmationMatches(id, current, input)) {
        return {
          ok: false,
          detail: {
            error: "published_slug_confirmation_required",
            currentSlug: current.slug,
            requestedSlug: input.slug,
            version: current.updatedAt.toISOString(),
          },
        };
      }

      if (status !== "draft" && input.publishedAtCorrection && !input.publishedAt) {
        return { ok: false, detail: { error: "validation_failed", fields: { publishedAt: ["已发布文章的发布时间不能为空"] } } };
      }
      const publishedAt = status === "draft" || input.publishedAtCorrection
        ? (input.publishedAt ? new Date(input.publishedAt) : null)
        : current.publishedAt;
      const updated = await update({
        title: input.title,
        summary: input.summary,
        coverUrl: input.coverUrl,
        slug: input.slug,
        markdown: input.markdown,
        publishedAt,
        seoDescription: input.seoDescription,
        updatedAt: nextVersion(current),
      });
      return { ok: true, post: serialize(updated) };
    });
    return result ?? { ok: false, detail: { error: "not_found" } };
  }

  async function transition(id: string, action: ArticleAction): Promise<ArticleServiceResult | DeleteServiceResult> {
    const result = await repository.transactRetained<ArticleServiceResult | DeleteServiceResult>(id, async (current, update) => {
      const status = statusOf(current);
      const target = resolveRetainedTransition(status, action);
      if (!target) return { ok: false, detail: { error: "invalid_transition", status, action } };

      if (action === "delete") {
        await update({ deletedAt: new Date(), updatedAt: nextVersion(current) });
        return { ok: true, deleted: { id, deleted: true } };
      }

      if (action === "publish") {
        const valid = adminPostInputSchema.safeParse({
          title: current.title,
          summary: current.summary,
          coverUrl: current.coverUrl,
          slug: current.slug,
          markdown: current.markdown,
          publishedAt: current.publishedAt?.toISOString() ?? null,
          seoDescription: current.seoDescription,
        });
        if (!valid.success) return { ok: false, detail: { error: "validation_failed", fields: validationFields(valid.error) } };
      }

      if (action === "republish" && !current.publishedAt) {
        return { ok: false, detail: { error: "validation_failed", fields: { publishedAt: ["重新发布需要保留首次发布时间"] } } };
      }
      const updated = await update({
        status: target,
        publishedAt: action === "publish" ? (current.publishedAt ?? new Date()) : current.publishedAt,
        updatedAt: nextVersion(current),
      });
      return { ok: true, post: serialize(updated) };
    });
    return result ?? { ok: false, detail: { error: "not_found" } };
  }

  return { createDraft, getDraft, listDrafts, updateDraft, transition };
}

export type ArticleService = ReturnType<typeof createArticleService>;
