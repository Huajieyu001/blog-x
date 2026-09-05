import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const administrators = pgTable("administrators", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("administrators_username_unique").on(table.username)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  administratorId: uuid("administrator_id").notNull().references(() => administrators.id, { onDelete: "cascade" }),
  tokenDigest: text("token_digest").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("sessions_token_digest_unique").on(table.tokenDigest), index("sessions_expiry_index").on(table.expiresAt)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Deliberately not a foreign key: deleting or rotating an administrator must
  // never rewrite or cascade into historical audit evidence.
  actorAdministratorId: uuid("actor_administrator_id").notNull(),
  event: text("event").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
}, (table) => [
  index("audit_events_newest_index").on(table.occurredAt.desc(), table.id.desc()),
  check("audit_events_event_check", sql`${table.event} in ('auth.login.succeeded', 'auth.logout.succeeded', 'article.created', 'article.updated', 'article.published', 'article.unpublished', 'article.republished', 'article.deleted', 'article.scheduled', 'article.rescheduled', 'article.schedule_cancelled', 'article.scheduled_published', 'category.created', 'category.updated', 'category.deleted', 'tag.created', 'tag.updated', 'tag.deleted', 'about.saved', 'about.published')`),
  check("audit_events_target_check", sql`(
    (${table.event} in ('auth.login.succeeded', 'auth.logout.succeeded') and ${table.targetType} = 'administrator' and ${table.targetId} = ${table.actorAdministratorId})
    or (${table.event} like 'article.%' and ${table.targetType} = 'article' and ${table.targetId} is not null)
    or (${table.event} like 'category.%' and ${table.targetType} = 'category' and ${table.targetId} is not null)
    or (${table.event} like 'tag.%' and ${table.targetType} = 'tag' and ${table.targetId} is not null)
    or (${table.event} like 'about.%' and ${table.targetType} = 'about' and ${table.targetId} is not null)
  )`),
  check("audit_events_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object' and octet_length(${table.metadata}::text) <= 2048`),
]);

export const media = pgTable("media", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceKey: text("source_key").notNull(),
  derivativeKey: text("derivative_key").notNull(),
  sourceMimeType: text("source_mime_type").notNull(),
  derivativeMimeType: text("derivative_mime_type").notNull(),
  sourceBytes: integer("source_bytes").notNull(),
  derivativeBytes: integer("derivative_bytes").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("media_source_key_unique").on(table.sourceKey),
  uniqueIndex("media_derivative_key_unique").on(table.derivativeKey),
  check("media_source_mime_check", sql`${table.sourceMimeType} in ('image/jpeg', 'image/png', 'image/webp')`),
  check("media_derivative_mime_check", sql`${table.derivativeMimeType} in ('image/jpeg', 'image/png', 'image/webp')`),
  check("media_dimensions_check", sql`${table.width} > 0 and ${table.height} > 0 and ${table.width} <= 2400 and ${table.height} <= 2400`),
  check("media_bytes_check", sql`${table.sourceBytes} > 0 and ${table.sourceBytes} <= 5242880 and ${table.derivativeBytes} > 0`),
]);

export const articles = pgTable("articles", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  coverUrl: text("cover_url").notNull().default(""),
  slug: text("slug").notNull(),
  markdown: text("markdown").notNull(),
  seoDescription: text("seo_description").notNull().default(""),
  status: text("status").notNull().default("published"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true, precision: 3 }),
  // This intentionally has no foreign key: administrator cleanup must not
  // silently remove the durable attribution required to publish a schedule.
  scheduledByAdministratorId: uuid("scheduled_by_administrator_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "restrict" }),
  coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "restrict" }),
  coverAlt: text("cover_alt").notNull().default(""),
  coverDecorative: boolean("cover_decorative").notNull().default(false),
  legacyMediaReview: text("legacy_media_review").notNull().default("pending"),
}, (table) => [
  uniqueIndex("articles_slug_reserved_unique").on(table.slug),
  index("articles_public_index").on(table.status, table.publishedAt),
  index("articles_category_public_index").on(table.categoryId, table.status, table.publishedAt),
  index("articles_cover_media_index").on(table.coverMediaId),
  index("articles_schedule_due_index").on(table.scheduledAt, table.id).where(sql`${table.status} = 'draft' and ${table.deletedAt} is null and ${table.scheduledAt} is not null`),
  check("articles_cover_alt_check", sql`${table.coverMediaId} is null or ${table.coverDecorative} or length(btrim(${table.coverAlt})) > 0`),
  check("articles_legacy_media_review_check", sql`${table.legacyMediaReview} in ('pending', 'clear', 'review_required')`),
  check("articles_schedule_pair_check", sql`(${table.scheduledAt} is null) = (${table.scheduledByAdministratorId} is null)`),
  check("articles_schedule_draft_check", sql`${table.scheduledAt} is null or (${table.status} = 'draft' and ${table.deletedAt} is null)`),
]);

export const articleDailyViews = pgTable("article_daily_views", {
  articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "restrict" }),
  day: date("day").notNull(),
  totalPv: integer("total_pv").notNull().default(0),
  directPv: integer("direct_pv").notNull().default(0),
  internalPv: integer("internal_pv").notNull().default(0),
  searchPv: integer("search_pv").notNull().default(0),
  socialPv: integer("social_pv").notNull().default(0),
  externalPv: integer("external_pv").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.articleId, table.day], name: "article_daily_views_pkey" }),
  index("article_daily_views_day_index").on(table.day, table.articleId),
  check("article_daily_views_counters_nonnegative_check", sql`${table.totalPv} >= 0 and ${table.directPv} >= 0 and ${table.internalPv} >= 0 and ${table.searchPv} >= 0 and ${table.socialPv} >= 0 and ${table.externalPv} >= 0`),
  check("article_daily_views_total_matches_sources_check", sql`${table.totalPv} = ${table.directPv} + ${table.internalPv} + ${table.searchPv} + ${table.socialPv} + ${table.externalPv}`),
]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("taxonomy_category_slug_unique").on(table.slug)]);

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("taxonomy_tag_slug_unique").on(table.slug)]);

export const articleTags = pgTable("article_tags", {
  articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "restrict" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "restrict" }),
}, (table) => [uniqueIndex("article_tags_article_tag_unique").on(table.articleId, table.tagId), index("article_tags_tag_index").on(table.tagId)]);

export const sitePages = pgTable("site_pages", {
  id: uuid("id").defaultRandom().primaryKey(), key: text("key").notNull(), title: text("title").notNull(), markdown: text("markdown").notNull().default(""), status: text("status").notNull().default("draft"), version: timestamp("version", { withTimezone: true }).defaultNow().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("site_pages_key_unique").on(table.key), check("site_pages_key_about_check", sql`${table.key} = 'about'`), check("site_pages_status_check", sql`${table.status} in ('draft', 'published')`)]);
