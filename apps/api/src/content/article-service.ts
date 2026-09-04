import {
  adminPostInputSchema,
  adminPostSchema,
  articleStatusSchema,
  type AdminPost,
  type AdminPostInput,
  type AdminPostUpdateInput,
  type ArticleAction,
  type ArticleStatus,
  type ScheduleArticleInput,
} from "@blog-x/contracts";
import type { AdminPostRepository, StoredAdminPost } from "./admin-repository.js";
import { resolveRetainedTransition } from "./article-state.js";
import { classifyArticleMedia } from "./media-reference-policy.js";

export type ArticleServiceError =
  | { error: "not_found" }
  | { error: "invalid_transition"; status: ArticleStatus; action: ArticleAction }
  | { error: "schedule_conflict"; status: ArticleStatus; reason: "not_draft" | "not_scheduled" }
  | { error: "validation_failed"; fields: Record<string, string[]> }
  | { error: "published_slug_confirmation_required"; currentSlug: string; requestedSlug: string; version: string };

export type ArticleServiceResult = { ok: true; post: AdminPost } | { ok: false; detail: ArticleServiceError };
export type DeleteServiceResult = { ok: true; deleted: { id: string; deleted: true } } | { ok: false; detail: ArticleServiceError };

function serialize(post: StoredAdminPost): AdminPost {
  const { updatedAt, coverMedia, ...wirePost } = post;
  return adminPostSchema.parse({
    ...wirePost,
    ...(coverMedia ? { coverMedia } : {}),
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

function mediaValidationFields({ markdown, coverUrl }: { markdown: string; coverUrl: string }) {
  const classification = classifyArticleMedia({ markdown, coverUrl });
  const fields: Record<string, string[]> = {};
  if (classification.invalidMarkdownSources.length) {
    fields.markdown = ["图片只能使用已上传媒体的 /media/<uuid> 地址"];
  }
  if (classification.invalidCoverUrl) {
    fields.coverUrl = ["封面只能选择已上传媒体；请清空历史封面 URL"];
  }
  return Object.keys(fields).length ? fields : null;
}

/**
 * Validates stored article state immediately before the draft-to-published
 * transition. The due publisher consumes this same policy in Plan 10-03, so
 * an article edited after scheduling cannot bypass manual publish validation.
 */
export function publicationReadinessFields(current: StoredAdminPost) {
  const valid = adminPostInputSchema.safeParse({
    title: current.title,
    summary: current.summary,
    coverUrl: current.coverUrl,
    slug: current.slug,
    markdown: current.markdown,
    publishedAt: current.publishedAt?.toISOString() ?? null,
    seoDescription: current.seoDescription,
    categoryId: current.categoryId,
    tagIds: current.tagIds,
    ...(current.coverMedia ? { coverMedia: current.coverMedia } : {}),
  });
  if (!valid.success) return validationFields(valid.error);
  return mediaValidationFields(current);
}

function statusOf(post: StoredAdminPost) {
  return articleStatusSchema.parse(post.status);
}

function nextVersion(current: StoredAdminPost, transactionNow: Date) {
  return new Date(Math.max(transactionNow.getTime(), current.updatedAt.getTime() + 1));
}

function confirmationMatches(id: string, current: StoredAdminPost, input: AdminPostUpdateInput) {
  return input.slugChangeConfirmation?.articleId === id
    && input.slugChangeConfirmation.currentSlug === current.slug
    && input.slugChangeConfirmation.version === current.updatedAt.toISOString();
}

const editableFields = [
  "title",
  "summary",
  "coverUrl",
  "slug",
  "markdown",
  "publishedAt",
  "seoDescription",
  "categoryId",
  "tagIds",
  "coverMedia",
] as const;

function equalDates(left: Date | null, right: string | null) {
  return (left?.toISOString() ?? null) === right;
}

function equalStringArrays(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function equalCoverMedia(left: StoredAdminPost["coverMedia"], right: AdminPostUpdateInput["coverMedia"]) {
  if (!left || !right) return left === null && right == null;
  return left.id === right.id && left.alt === right.alt && left.decorative === right.decorative;
}

function changedFieldNames(current: StoredAdminPost, input: AdminPostUpdateInput, publishedAt: Date | null) {
  const valuesMatch: Record<(typeof editableFields)[number], boolean> = {
    title: current.title === input.title,
    summary: current.summary === input.summary,
    coverUrl: current.coverUrl === input.coverUrl,
    slug: current.slug === input.slug,
    markdown: current.markdown === input.markdown,
    publishedAt: equalDates(publishedAt, current.publishedAt?.toISOString() ?? null),
    seoDescription: current.seoDescription === input.seoDescription,
    categoryId: current.categoryId === input.categoryId,
    tagIds: equalStringArrays(current.tagIds, input.tagIds),
    coverMedia: equalCoverMedia(current.coverMedia, input.coverMedia),
  };
  return editableFields.filter((field) => !valuesMatch[field]);
}

export function createArticleService(repository: AdminPostRepository) {
  async function createDraft(input: AdminPostInput, actorAdministratorId: string) {
    const fields = mediaValidationFields(input);
    if (fields) return { ok: false, detail: { error: "validation_failed", fields } } as const;
    const post = await repository.createDraft(input, actorAdministratorId);
    if (!post) throw new Error("draft was not persisted");
    return { ok: true, post: serialize(post) } as const;
  }

  async function getDraft(id: string) {
    const post = await repository.findRetainedById(id);
    return post ? serialize(post) : null;
  }

  async function listDrafts() {
    return Promise.all((await repository.listRetained()).map(serialize));
  }

  async function updateDraft(id: string, input: AdminPostUpdateInput, actorAdministratorId: string): Promise<ArticleServiceResult> {
    const result = await repository.transactRetained<ArticleServiceResult>(id, actorAdministratorId, async (current, update, audit, transactionNow) => {
      const status = statusOf(current);
      if (!resolveRetainedTransition(status, "edit")) return { ok: false, detail: { error: "not_found" } };
      const mediaFields = mediaValidationFields(input);
      if (mediaFields) return { ok: false, detail: { error: "validation_failed", fields: mediaFields } };
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
      const changedFields = changedFieldNames(current, input, publishedAt);
      const updated = await update({
        title: input.title,
        summary: input.summary,
        coverUrl: input.coverUrl,
        slug: input.slug,
        markdown: input.markdown,
        publishedAt,
        seoDescription: input.seoDescription,
        categoryId: input.categoryId,
        coverMediaId: input.coverMedia?.id ?? null,
        coverAlt: input.coverMedia?.alt ?? "",
        coverDecorative: input.coverMedia?.decorative ?? false,
        legacyMediaReview: "clear",
        updatedAt: nextVersion(current, transactionNow),
      }, input.tagIds);
      await audit("article.updated", { previousStatus: status, status, changedFields });
      return { ok: true, post: serialize(updated) };
    });
    return result ?? { ok: false, detail: { error: "not_found" } };
  }

  async function transition(id: string, action: ArticleAction, actorAdministratorId: string): Promise<ArticleServiceResult | DeleteServiceResult> {
    const result = await repository.transactRetained<ArticleServiceResult | DeleteServiceResult>(id, actorAdministratorId, async (current, update, audit, transactionNow) => {
      const status = statusOf(current);
      const target = resolveRetainedTransition(status, action);
      if (!target) return { ok: false, detail: { error: "invalid_transition", status, action } };

      if (action === "delete") {
        await update({
          deletedAt: transactionNow,
          scheduledAt: null,
          scheduledByAdministratorId: null,
          updatedAt: nextVersion(current, transactionNow),
        });
        await audit("article.deleted", { previousStatus: status, status: "deleted" });
        return { ok: true, deleted: { id, deleted: true } };
      }

      if (action === "publish") {
        const fields = publicationReadinessFields(current);
        if (fields) return { ok: false, detail: { error: "validation_failed", fields } };
      }

      if (action === "republish" && !current.publishedAt) {
        return { ok: false, detail: { error: "validation_failed", fields: { publishedAt: ["重新发布需要保留首次发布时间"] } } };
      }
      if (action === "republish") {
        const mediaFields = mediaValidationFields(current);
        if (mediaFields) return { ok: false, detail: { error: "validation_failed", fields: mediaFields } };
      }
      const updated = await update({
        status: target,
        // A draft's old authored timestamp is never schedule authority. The
        // first successful draft-to-published transition establishes public
        // history from the database transaction, while republish keeps it.
        publishedAt: action === "publish" ? transactionNow : current.publishedAt,
        ...(action === "publish" ? { scheduledAt: null, scheduledByAdministratorId: null } : {}),
        ...(action === "publish" || action === "republish" ? { legacyMediaReview: "clear" } : {}),
        updatedAt: nextVersion(current, transactionNow),
      });
      const event = {
        publish: "article.published",
        unpublish: "article.unpublished",
        republish: "article.republished",
      }[action] as "article.published" | "article.unpublished" | "article.republished";
      await audit(event, { previousStatus: status, status: target });
      return { ok: true, post: serialize(updated) };
    });
    return result ?? { ok: false, detail: { error: "not_found" } };
  }

  async function schedule(id: string, input: ScheduleArticleInput, actorAdministratorId: string): Promise<ArticleServiceResult> {
    const requestedAt = new Date(input.scheduledAt);
    const result = await repository.transactRetained<ArticleServiceResult>(id, actorAdministratorId, async (current, update, audit, transactionNow) => {
      const status = statusOf(current);
      if (status !== "draft") return { ok: false, detail: { error: "schedule_conflict", status, reason: "not_draft" } };
      if (requestedAt.getTime() <= transactionNow.getTime()) {
        return { ok: false, detail: { error: "validation_failed", fields: { scheduledAt: ["预约时间必须晚于数据库当前时间"] } } };
      }
      const event = current.scheduledAt ? "article.rescheduled" : "article.scheduled";
      const updated = await update({
        scheduledAt: requestedAt,
        scheduledByAdministratorId: actorAdministratorId,
        updatedAt: nextVersion(current, transactionNow),
      });
      await audit(event, { scheduledAt: requestedAt.toISOString() });
      return { ok: true, post: serialize(updated) };
    });
    return result ?? { ok: false, detail: { error: "not_found" } };
  }

  async function cancelSchedule(id: string, actorAdministratorId: string): Promise<ArticleServiceResult> {
    const result = await repository.transactRetained<ArticleServiceResult>(id, actorAdministratorId, async (current, update, audit, transactionNow) => {
      const status = statusOf(current);
      if (status !== "draft") return { ok: false, detail: { error: "schedule_conflict", status, reason: "not_draft" } };
      if (!current.scheduledAt) return { ok: false, detail: { error: "schedule_conflict", status, reason: "not_scheduled" } };
      const scheduledAt = current.scheduledAt.toISOString();
      // Record the former deadline before clearing its retained authority in
      // the same transaction, so cancellation has durable evidence but no
      // scheduling metadata survives the commit.
      await audit("article.schedule_cancelled", { scheduledAt });
      const updated = await update({
        scheduledAt: null,
        scheduledByAdministratorId: null,
        updatedAt: nextVersion(current, transactionNow),
      });
      return { ok: true, post: serialize(updated) };
    });
    return result ?? { ok: false, detail: { error: "not_found" } };
  }

  return { createDraft, getDraft, listDrafts, updateDraft, transition, schedule, cancelSchedule };
}

export type ArticleService = ReturnType<typeof createArticleService>;
