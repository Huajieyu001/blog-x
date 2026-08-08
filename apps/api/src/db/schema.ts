import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
}, (table) => [uniqueIndex("articles_slug_reserved_unique").on(table.slug), index("articles_public_index").on(table.status, table.publishedAt), index("articles_category_public_index").on(table.categoryId, table.status, table.publishedAt)]);

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
}, (table) => [uniqueIndex("site_pages_key_unique").on(table.key)]);
