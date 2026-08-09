import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "restrict" }),
  coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "restrict" }),
  coverAlt: text("cover_alt").notNull().default(""),
  coverDecorative: boolean("cover_decorative").notNull().default(false),
}, (table) => [
  uniqueIndex("articles_slug_reserved_unique").on(table.slug),
  index("articles_public_index").on(table.status, table.publishedAt),
  index("articles_category_public_index").on(table.categoryId, table.status, table.publishedAt),
  index("articles_cover_media_index").on(table.coverMediaId),
  check("articles_cover_alt_check", sql`${table.coverMediaId} is null or ${table.coverDecorative} or length(btrim(${table.coverAlt})) > 0`),
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
