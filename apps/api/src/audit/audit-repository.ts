import {
  auditEventListSchema,
  auditEventInputSchema,
  auditCursorSchema,
  type AuditCursor,
  type AuditEventName,
  type AuditMetadata,
  type AuditTargetType,
} from "@blog-x/contracts";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;
type InsertExecutor = Pick<Database, "insert">;

export type AuditEventInput = {
  actorAdministratorId: string;
  event: AuditEventName;
  targetType: AuditTargetType;
  targetId: string;
  metadata?: AuditMetadata;
};

const expectedTarget: Record<AuditEventName, AuditTargetType> = {
  "auth.login.succeeded": "administrator",
  "auth.logout.succeeded": "administrator",
  "article.created": "article",
  "article.updated": "article",
  "article.published": "article",
  "article.unpublished": "article",
  "article.republished": "article",
  "article.deleted": "article",
  "article.scheduled": "article",
  "article.rescheduled": "article",
  "article.schedule_cancelled": "article",
  "article.scheduled_published": "article",
  "category.created": "category",
  "category.updated": "category",
  "category.deleted": "category",
  "tag.created": "tag",
  "tag.updated": "tag",
  "tag.deleted": "tag",
  "about.saved": "about",
  "about.published": "about",
};

export async function appendAuditEvent(executor: InsertExecutor, input: AuditEventInput) {
  const event = auditEventInputSchema.parse(input);
  if (expectedTarget[event.event] !== event.targetType) throw new Error("audit target does not match event");
  if (event.targetType === "administrator" && event.targetId !== event.actorAdministratorId) throw new Error("session event target must be its actor");
  if (Buffer.byteLength(JSON.stringify(event.metadata), "utf8") > 2_048) throw new Error("audit metadata exceeds 2048 bytes");
  await executor.insert(schema.auditEvents).values(event);
}

function encodeCursor(cursor: AuditCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAuditCursor(value: string): AuditCursor {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw new Error("invalid audit cursor");
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { throw new Error("invalid audit cursor"); }
  const parsed = auditCursorSchema.safeParse(decoded);
  if (!parsed.success) throw new Error("invalid audit cursor");
  return parsed.data;
}

export function createAuditRepository(db: Database) {
  async function list(options: { limit: number; cursor?: AuditCursor }) {
    const cursorDate = options.cursor ? new Date(options.cursor.occurredAt) : null;
    const before = options.cursor && cursorDate
      ? or(
        lt(schema.auditEvents.occurredAt, cursorDate),
        and(eq(schema.auditEvents.occurredAt, cursorDate), lt(schema.auditEvents.id, options.cursor.id)),
      )
      : undefined;
    const rows = await db.select().from(schema.auditEvents)
      .where(before)
      .orderBy(desc(schema.auditEvents.occurredAt), desc(schema.auditEvents.id))
      .limit(options.limit + 1);
    const hasMore = rows.length > options.limit;
    const items = rows.slice(0, options.limit).map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      actorAdministratorId: row.actorAdministratorId,
      event: row.event,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: row.metadata,
    }));
    const last = hasMore ? rows[options.limit - 1] : undefined;
    return auditEventListSchema.parse({
      items,
      nextCursor: last ? encodeCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id }) : null,
    });
  }

  return { append: (input: AuditEventInput) => appendAuditEvent(db, input), list };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
