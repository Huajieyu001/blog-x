import { viewRetentionResultSchema, type ViewRetentionResult } from "@blog-x/contracts";
import type { ViewAggregationRepository } from "./view-aggregation-repository.js";

export const viewRetentionMaximumLimit = 10_000;

type CleanupViewsArguments = { ok: true; limit: number } | { ok: false; code: "invalid_arguments" };
type CleanupViewsFailureCode = "invalid_arguments" | "configuration_failed" | "cleanup_failed";

export function parseCleanupViewsArguments(arguments_: string[]): CleanupViewsArguments {
  if (arguments_.length !== 1) return { ok: false, code: "invalid_arguments" };
  const match = /^--limit=(\d+)$/.exec(arguments_[0] ?? "");
  if (!match) return { ok: false, code: "invalid_arguments" };
  const limit = Number(match[1]);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= viewRetentionMaximumLimit
    ? { ok: true, limit }
    : { ok: false, code: "invalid_arguments" };
}

export async function runViewRetention(repository: Pick<ViewAggregationRepository, "cleanupExpiredDailyViews">, limit: number): Promise<ViewRetentionResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > viewRetentionMaximumLimit) throw new Error("invalid cleanup limit");
  const result = await repository.cleanupExpiredDailyViews(limit);
  return viewRetentionResultSchema.parse({
    format: "blog-x-view-retention",
    version: 1,
    command: "cleanup-views",
    retainedFromDay: result.retainedFromDay,
    limit,
    deleted: result.deleted,
  });
}

export function formatCleanupViewsResult(result: Omit<ViewRetentionResult, "format" | "version">) {
  return JSON.stringify(viewRetentionResultSchema.parse({ format: "blog-x-view-retention", version: 1, ...result }));
}

export function formatCleanupViewsFailure(code: CleanupViewsFailureCode) {
  return JSON.stringify({ format: "blog-x-view-retention", version: 1, command: "cleanup-views", code });
}
