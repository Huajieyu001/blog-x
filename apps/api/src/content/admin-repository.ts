import { legacyMediaReviewSchema, mediaReferenceSchema, type AdminPostInput, type AuditEventName, type AuditMetadata, type MediaReference } from "@blog-x/contracts";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendAuditEvent } from "../audit/audit-repository.js";
import * as schema from "../db/schema.js";
import { extractArticleMediaIds } from "./media-reference-policy.js";

export class MissingMediaReferenceError extends Error {
  constructor() { super("article references missing or deleted media"); }
}

type Database = NodePgDatabase<typeof schema>;
const selectedPost = {
  id: schema.articles.id,
  title: schema.articles.title,
  summary: schema.articles.summary,
  coverUrl: schema.articles.coverUrl,
  slug: schema.articles.slug,
  markdown: schema.articles.markdown,
  publishedAt: schema.articles.publishedAt,
  scheduledAt: schema.articles.scheduledAt,
  scheduledByAdministratorId: schema.articles.scheduledByAdministratorId,
  seoDescription: schema.articles.seoDescription,
  status: schema.articles.status,
  updatedAt: schema.articles.updatedAt,
  categoryId: schema.articles.categoryId,
  coverMediaId: schema.articles.coverMediaId,
  coverAlt: schema.articles.coverAlt,
  coverDecorative: schema.articles.coverDecorative,
  legacyMediaReview: schema.articles.legacyMediaReview,
};

// Never widen this projection: deleted-list consumers must not receive article
// content or publication metadata merely to offer a recovery action.
const selectedDeletedPost = {
  id: schema.articles.id,
  title: schema.articles.title,
  slug: schema.articles.slug,
  status: schema.articles.status,
  deletedAt: schema.articles.deletedAt,
  updatedAt: schema.articles.updatedAt,
};

export type StoredAdminPost = {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  slug: string;
  markdown: string;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  scheduledByAdministratorId: string | null;
  seoDescription: string;
  status: string;
  updatedAt: Date;
  categoryId: string | null;
  tagIds: string[];
  coverMedia: MediaReference | null;
  legacyMediaReview: "pending" | "clear" | "review_required";
};

export type StoredDeletedPost = {
  id: string;
  title: string;
  slug: string;
  status: string;
  deletedAt: Date;
  updatedAt: Date;
};

export type RetainedArticleChanges = Partial<{
  title: string;
  summary: string;
  coverUrl: string;
  slug: string;
  markdown: string;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  scheduledByAdministratorId: string | null;
  seoDescription: string;
  status: string;
  deletedAt: Date | null;
  updatedAt: Date;
  categoryId: string | null;
  coverMediaId: string | null;
  coverAlt: string;
  coverDecorative: boolean;
  legacyMediaReview: "pending" | "clear" | "review_required";
}>;

type RetainedArticleUpdate = (
  changes: RetainedArticleChanges,
  tagIds?: string[],
) => Promise<StoredAdminPost>;

type RetainedArticleAudit = (
  event: Extract<AuditEventName, `article.${string}`>,
  metadata?: AuditMetadata,
) => Promise<void>;

type DeletedArticleUpdate = (changes: Pick<RetainedArticleChanges, "status" | "deletedAt" | "scheduledAt" | "scheduledByAdministratorId" | "updatedAt">) => Promise<void>;

type DeletedArticleAudit = RetainedArticleAudit;

export type DueArticleCandidate = {
  current: StoredAdminPost;
  update: RetainedArticleUpdate;
  audit: RetainedArticleAudit;
};

function values(input: AdminPostInput) {
  const { tagIds, coverMedia, ...article } = input;
  return {
    article: {
      ...article,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      coverMediaId: coverMedia?.id ?? null,
      coverAlt: coverMedia?.alt ?? "",
      coverDecorative: coverMedia?.decorative ?? false,
      legacyMediaReview: "clear" as const,
    },
    tagIds,
  };
}

function mediaIds(input: { markdown: string; coverMedia?: MediaReference | null; coverMediaId?: string | null }) {
  const ids = extractArticleMediaIds(input.markdown);
  const coverId = input.coverMedia?.id ?? input.coverMediaId;
  if (coverId) ids.add(coverId);
  return [...ids].sort();
}

export function createAdminPostRepository(db: Database) {
  async function lockRetainedMedia(executor: Database, input: { markdown: string; coverMedia?: MediaReference | null; coverMediaId?: string | null }) {
    const ids = mediaIds(input);
    if (!ids.length) return;
    const rows = await executor.select({ id: schema.media.id }).from(schema.media)
      .where(and(inArray(schema.media.id, ids), isNull(schema.media.deletedAt))).for("key share");
    if (rows.length !== ids.length) throw new MissingMediaReferenceError();
  }
  async function hydrate(executor: Database, post: typeof schema.articles.$inferSelect, tagIds?: string[]): Promise<StoredAdminPost> {
    const resolvedTags = tagIds ?? (await executor.select({ tagId: schema.articleTags.tagId }).from(schema.articleTags).where(eq(schema.articleTags.articleId, post.id))).map((row) => row.tagId);
    let coverMedia: MediaReference | null = null;
    if (post.coverMediaId) {
      const asset = (await executor.select({ id: schema.media.id, width: schema.media.width, height: schema.media.height, mimeType: schema.media.derivativeMimeType }).from(schema.media).where(eq(schema.media.id, post.coverMediaId)).limit(1))[0];
      if (!asset) throw new Error("cover media reference is missing");
      coverMedia = mediaReferenceSchema.parse({ ...asset, url: `/media/${asset.id}`, alt: post.coverAlt, decorative: post.coverDecorative });
    }
    const { coverMediaId: _coverMediaId, coverAlt: _coverAlt, coverDecorative: _coverDecorative, legacyMediaReview, ...stored } = post;
    return { ...stored, legacyMediaReview: legacyMediaReviewSchema.parse(legacyMediaReview), tagIds: resolvedTags, coverMedia };
  }

  async function createDraft(input: AdminPostInput, actorAdministratorId: string) {
    return db.transaction(async (tx) => {
      const { tagIds, article } = values(input);
      await lockRetainedMedia(tx as Database, { markdown: article.markdown, coverMediaId: article.coverMediaId });
      const created = (await tx.insert(schema.articles).values({ ...article, status: "draft" }).returning(selectedPost))[0];
      if (!created) return null;
      if (tagIds.length) await tx.insert(schema.articleTags).values(tagIds.map((tagId) => ({ articleId: created.id, tagId })));
      await appendAuditEvent(tx, {
        actorAdministratorId,
        event: "article.created",
        targetType: "article",
        targetId: created.id,
        metadata: { status: "draft" },
      });
      return hydrate(tx as Database, created as typeof schema.articles.$inferSelect, tagIds);
    });
  }

  async function findRetainedById(id: string) {
    const post = (await db.select(selectedPost).from(schema.articles).where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt))).limit(1))[0]; if (!post) return null; return hydrate(db, post as typeof schema.articles.$inferSelect);
  }

  async function listRetained() {
    const posts = await db.select(selectedPost).from(schema.articles).where(isNull(schema.articles.deletedAt)).orderBy(desc(schema.articles.updatedAt)); return Promise.all(posts.map((post) => hydrate(db, post as typeof schema.articles.$inferSelect)));
  }

  async function listDeleted(): Promise<StoredDeletedPost[]> {
    const posts = await db.select(selectedDeletedPost).from(schema.articles)
      .where(isNotNull(schema.articles.deletedAt))
      .orderBy(desc(schema.articles.deletedAt), desc(schema.articles.id));
    return posts.map((post): StoredDeletedPost => {
      if (!post.deletedAt) throw new Error("deleted article projection is missing deletion time");
      return { ...post, deletedAt: post.deletedAt };
    });
  }

  async function transactRetained<T>(
    id: string,
    actorAdministratorId: string,
    operation: (current: StoredAdminPost, update: RetainedArticleUpdate, audit: RetainedArticleAudit, transactionNow: Date) => Promise<T>,
  ): Promise<T | null> {
    return db.transaction(async (tx) => {
      const current = (await tx.select(selectedPost).from(schema.articles)
        .where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt))).limit(1).for("update"))[0];
      if (!current) return null;
      const currentWithTags = await hydrate(tx as Database, current as typeof schema.articles.$inferSelect);
      await lockRetainedMedia(tx as Database, { markdown: currentWithTags.markdown, coverMedia: currentWithTags.coverMedia });
      // PostgreSQL evaluates CURRENT_TIMESTAMP once per transaction. Exposing that
      // exact value keeps schedule policy, versioning, and later due publication
      // independent of the API host clock.
      const transactionNowRaw = (await tx.execute<{ transactionNow: Date | string }>(sql`select CURRENT_TIMESTAMP as "transactionNow"`)).rows[0]?.transactionNow;
      const transactionNow = transactionNowRaw instanceof Date ? transactionNowRaw : new Date(String(transactionNowRaw));
      if (Number.isNaN(transactionNow.getTime())) throw new Error("transaction timestamp is unavailable");
      const update: RetainedArticleUpdate = async (changes, tagIds) => {
        await lockRetainedMedia(tx as Database, {
          markdown: changes.markdown ?? currentWithTags.markdown,
          coverMediaId: changes.coverMediaId === undefined ? current.coverMediaId : changes.coverMediaId,
        });
        const updated = (await tx.update(schema.articles).set(changes).where(eq(schema.articles.id, id)).returning(selectedPost))[0];
        if (!updated) throw new Error("retained article update did not return a row");
        if (tagIds) {
          await tx.delete(schema.articleTags).where(eq(schema.articleTags.articleId, id));
          if (tagIds.length) {
            await tx.insert(schema.articleTags).values(tagIds.map((tagId) => ({ articleId: id, tagId })));
          }
        }
        return hydrate(tx as Database, updated as typeof schema.articles.$inferSelect, tagIds ?? currentWithTags.tagIds);
      };
      const audit: RetainedArticleAudit = (event, metadata) => appendAuditEvent(tx, {
        actorAdministratorId,
        event,
        targetType: "article",
        targetId: id,
        ...(metadata ? { metadata } : {}),
      });
      return operation(currentWithTags, update, audit, transactionNow);
    });
  }

  async function transactDeleted<T>(
    id: string,
    actorAdministratorId: string,
    operation: (current: StoredDeletedPost, update: DeletedArticleUpdate, audit: DeletedArticleAudit, transactionNow: Date) => Promise<T>,
  ): Promise<T | null> {
    return db.transaction(async (tx) => {
      const current = (await tx.select(selectedDeletedPost).from(schema.articles)
        .where(and(eq(schema.articles.id, id), isNotNull(schema.articles.deletedAt))).limit(1).for("update"))[0];
      if (!current?.deletedAt) return null;
      const deletedCurrent: StoredDeletedPost = { ...current, deletedAt: current.deletedAt };
      const transactionNowRaw = (await tx.execute<{ transactionNow: Date | string }>(sql`select CURRENT_TIMESTAMP as "transactionNow"`)).rows[0]?.transactionNow;
      const transactionNow = transactionNowRaw instanceof Date ? transactionNowRaw : new Date(String(transactionNowRaw));
      if (Number.isNaN(transactionNow.getTime())) throw new Error("transaction timestamp is unavailable");
      const update: DeletedArticleUpdate = async (changes) => {
        const updated = (await tx.update(schema.articles).set(changes).where(and(eq(schema.articles.id, id), isNotNull(schema.articles.deletedAt))).returning({ id: schema.articles.id }))[0];
        if (!updated) throw new Error("deleted article update did not return a row");
      };
      const audit: DeletedArticleAudit = (event, metadata) => appendAuditEvent(tx, {
        actorAdministratorId,
        event,
        targetType: "article",
        targetId: id,
        ...(metadata ? { metadata } : {}),
      });
      return operation(deletedCurrent, update, audit, transactionNow);
    });
  }

  /**
   * Claims the first due rows under PostgreSQL locks and leaves those locks held
   * until the caller has either published every candidate or thrown.  The
   * caller deliberately receives all candidates before it mutates one so a
   * malformed later row cannot result in a partial visible batch.
   */
  async function transactDue<T>(
    limit: number,
    operation: (candidates: DueArticleCandidate[], transactionNow: Date) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) => {
      const transactionNowRaw = (await tx.execute<{ transactionNow: Date | string }>(sql`select CURRENT_TIMESTAMP as "transactionNow"`)).rows[0]?.transactionNow;
      const transactionNow = transactionNowRaw instanceof Date ? transactionNowRaw : new Date(String(transactionNowRaw));
      if (Number.isNaN(transactionNow.getTime())) throw new Error("transaction timestamp is unavailable");
      const dueRows = await tx.select(selectedPost).from(schema.articles)
        .where(and(
          eq(schema.articles.status, "draft"),
          isNull(schema.articles.deletedAt),
          isNotNull(schema.articles.scheduledAt),
          lte(schema.articles.scheduledAt, transactionNow),
        ))
        .orderBy(asc(schema.articles.scheduledAt), asc(schema.articles.id))
        .limit(limit)
        .for("update", { skipLocked: true });
      const candidates = await Promise.all(dueRows.map(async (row) => {
        const current = await hydrate(tx as Database, row as typeof schema.articles.$inferSelect);
        const update: RetainedArticleUpdate = async (changes, tagIds) => {
          const updated = (await tx.update(schema.articles).set(changes).where(eq(schema.articles.id, current.id)).returning(selectedPost))[0];
          if (!updated) throw new Error("due article update did not return a row");
          if (tagIds) {
            await tx.delete(schema.articleTags).where(eq(schema.articleTags.articleId, current.id));
            if (tagIds.length) await tx.insert(schema.articleTags).values(tagIds.map((tagId) => ({ articleId: current.id, tagId })));
          }
          return hydrate(tx as Database, updated as typeof schema.articles.$inferSelect, tagIds ?? current.tagIds);
        };
        const audit: RetainedArticleAudit = (event, metadata) => {
          if (!current.scheduledByAdministratorId) throw new Error("due article is missing scheduling authority");
          return appendAuditEvent(tx, {
            actorAdministratorId: current.scheduledByAdministratorId,
            event,
            targetType: "article",
            targetId: current.id,
            ...(metadata ? { metadata } : {}),
          });
        };
        return { current, update, audit };
      }));
      return operation(candidates, transactionNow);
    });
  }

  return { createDraft, findRetainedById, listRetained, listDeleted, transactRetained, transactDeleted, transactDue };
}

export type AdminPostRepository = ReturnType<typeof createAdminPostRepository>;
