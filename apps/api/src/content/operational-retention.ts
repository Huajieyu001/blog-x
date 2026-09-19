import { operationalRetentionResultSchema, type OperationalRetentionResult } from "@blog-x/contracts";
import type { SessionService } from "../auth/sessions.js";
import type { ViewAggregationRepository } from "./view-aggregation-repository.js";

export const operationalRetentionMaximumLimit = 10_000;

type OperationalRetentionArguments =
  | { ok: true; viewsLimit: number; sessionsLimit: number }
  | { ok: false; code: "invalid_arguments" };

type RetentionDependencies = Pick<ViewAggregationRepository, "cleanupExpiredDailyViews"> & Pick<SessionService, "cleanupExpiredSessions">;

function boundedLimit(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= operationalRetentionMaximumLimit ? limit : null;
}

export function parseOperationalRetentionArguments(arguments_: string[]): OperationalRetentionArguments {
  if (arguments_.length !== 2) return { ok: false, code: "invalid_arguments" };
  let viewsLimit: number | undefined;
  let sessionsLimit: number | undefined;
  for (const argument of arguments_) {
    const match = /^--(views|sessions)-limit=(.+)$/.exec(argument);
    if (!match) return { ok: false, code: "invalid_arguments" };
    const limit = boundedLimit(match[2]);
    if (limit === null) return { ok: false, code: "invalid_arguments" };
    if (match[1] === "views") {
      if (viewsLimit !== undefined) return { ok: false, code: "invalid_arguments" };
      viewsLimit = limit;
    } else {
      if (sessionsLimit !== undefined) return { ok: false, code: "invalid_arguments" };
      sessionsLimit = limit;
    }
  }
  return viewsLimit === undefined || sessionsLimit === undefined
    ? { ok: false, code: "invalid_arguments" }
    : { ok: true, viewsLimit, sessionsLimit };
}

export async function runOperationalRetention(
  repositories: RetentionDependencies,
  limits: { viewsLimit: number; sessionsLimit: number },
): Promise<OperationalRetentionResult> {
  const views = await repositories.cleanupExpiredDailyViews(limits.viewsLimit);
  const sessions = await repositories.cleanupExpiredSessions(limits.sessionsLimit);
  return operationalRetentionResultSchema.parse({
    format: "blog-x-operational-retention",
    version: 1,
    command: "retention",
    observedAt: sessions.observedAt.toISOString(),
    views: { limit: limits.viewsLimit, ...views },
    sessions: {
      limit: limits.sessionsLimit,
      deleted: sessions.deleted,
      expiredBefore: sessions.observedAt.toISOString(),
      revokedBefore: sessions.revokedBefore.toISOString(),
    },
  });
}

export function formatOperationalRetentionResult(result: OperationalRetentionResult) {
  return JSON.stringify(operationalRetentionResultSchema.parse(result));
}

export function formatOperationalRetentionFailure(code: "invalid_arguments" | "configuration_failed" | "cleanup_failed") {
  return JSON.stringify({ format: "blog-x-operational-retention", version: 1, command: "retention", code });
}
