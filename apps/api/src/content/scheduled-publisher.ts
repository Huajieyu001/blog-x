import type { AdminPostRepository, DueArticleCandidate, StoredAdminPost } from "./admin-repository.js";
import { publicationReadinessFields } from "./article-service.js";

export const publishDueMaximumLimit = 100;

export type PublishDueResult = {
  at: Date;
  limit: number;
  claimed: number;
  publishedIds: string[];
};

export class ScheduledPublicationError extends Error {
  constructor(readonly code: "invalid_candidate" | "transaction_failed") {
    super(code);
    this.name = "ScheduledPublicationError";
  }
}

/** Internal test seams model database failures without widening the CLI contract. */
export type ScheduledPublisherHooks = {
  beforeValidation?: (candidate: DueArticleCandidate) => void | Promise<void>;
  beforeUpdate?: (candidate: DueArticleCandidate) => void | Promise<void>;
  beforeAudit?: (candidate: DueArticleCandidate) => void | Promise<void>;
};

function nextVersion(current: StoredAdminPost, transactionNow: Date) {
  return new Date(Math.max(transactionNow.getTime(), current.updatedAt.getTime() + 1));
}

function assertDueCandidate(candidate: DueArticleCandidate, transactionNow: Date) {
  const { current } = candidate;
  if (
    current.status !== "draft"
    || !current.scheduledAt
    || !current.scheduledByAdministratorId
    || current.scheduledAt.getTime() > transactionNow.getTime()
  ) throw new ScheduledPublicationError("invalid_candidate");
  if (publicationReadinessFields(current)) throw new ScheduledPublicationError("invalid_candidate");
}

/**
 * A one-shot, local-only publisher.  It intentionally owns no timer, queue,
 * HTTP route, or process-local mutex: PostgreSQL row locks are the shared
 * authority across concurrent invocations.
 */
export function createScheduledPublisher(repository: Pick<AdminPostRepository, "transactDue">, hooks: ScheduledPublisherHooks = {}) {
  async function publishDue(limit: number): Promise<PublishDueResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > publishDueMaximumLimit) {
      throw new ScheduledPublicationError("transaction_failed");
    }
    return repository.transactDue(limit, async (candidates, transactionNow) => {
      // Validate every locked row before making one of them externally visible.
      // Throwing from this callback rolls the complete ordered batch back.
      for (const candidate of candidates) {
        await hooks.beforeValidation?.(candidate);
        assertDueCandidate(candidate, transactionNow);
      }
      for (const candidate of candidates) {
        const scheduledAt = candidate.current.scheduledAt;
        if (!scheduledAt) throw new ScheduledPublicationError("invalid_candidate");
        await hooks.beforeUpdate?.(candidate);
        await candidate.update({
          status: "published",
          publishedAt: transactionNow,
          scheduledAt: null,
          scheduledByAdministratorId: null,
          legacyMediaReview: "clear",
          updatedAt: nextVersion(candidate.current, transactionNow),
        });
        await hooks.beforeAudit?.(candidate);
        await candidate.audit("article.scheduled_published", { scheduledAt: scheduledAt.toISOString() });
      }
      return {
        at: transactionNow,
        limit,
        claimed: candidates.length,
        publishedIds: candidates.map(({ current }) => current.id),
      };
    });
  }

  return { publishDue };
}
