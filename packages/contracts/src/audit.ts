import { z } from "zod";

export const auditEventNameSchema = z.enum([
  "auth.login.succeeded",
  "auth.logout.succeeded",
  "article.created",
  "article.updated",
  "article.published",
  "article.unpublished",
  "article.republished",
  "article.deleted",
  "article.scheduled",
  "article.rescheduled",
  "article.schedule_cancelled",
  "article.scheduled_published",
  "category.created",
  "category.updated",
  "category.deleted",
  "tag.created",
  "tag.updated",
  "tag.deleted",
  "about.saved",
  "about.published",
]);

export const auditTargetTypeSchema = z.enum(["administrator", "article", "category", "tag", "about"]);

const changedFieldSchema = z.enum([
  "title", "summary", "coverUrl", "slug", "markdown", "publishedAt", "seoDescription",
  "categoryId", "tagIds", "coverMedia", "name", "status", "scheduledAt",
]);
const auditStatusSchema = z.enum(["draft", "published", "unpublished", "deleted"]);

export const auditMetadataSchema = z.object({
  changedFields: z.array(changedFieldSchema).max(20).optional(),
  previousStatus: auditStatusSchema.optional(),
  status: auditStatusSchema.optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  previousScheduledAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export const auditEventInputSchema = z.object({
  actorAdministratorId: z.uuid(),
  event: auditEventNameSchema,
  targetType: auditTargetTypeSchema,
  targetId: z.uuid(),
  metadata: auditMetadataSchema.optional().default({}),
}).strict();

export const auditCursorSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }),
  id: z.uuid(),
}).strict();

export const auditEventSchema = z.object({
  id: z.uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  actorAdministratorId: z.uuid(),
  event: auditEventNameSchema,
  targetType: auditTargetTypeSchema,
  targetId: z.uuid(),
  metadata: auditMetadataSchema,
}).strict();

export const auditEventListSchema = z.object({
  items: z.array(auditEventSchema).max(50),
  nextCursor: z.string().max(512).nullable(),
}).strict();

export const auditEventQuerySchema = z.object({
  cursor: z.string().regex(/^[A-Za-z0-9_-]+$/).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
}).strict();

export type AuditEventName = z.infer<typeof auditEventNameSchema>;
export type AuditTargetType = z.infer<typeof auditTargetTypeSchema>;
export type AuditMetadata = z.infer<typeof auditMetadataSchema>;
export type AuditEventInput = z.input<typeof auditEventInputSchema>;
export type AuditCursor = z.infer<typeof auditCursorSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditEventList = z.infer<typeof auditEventListSchema>;
