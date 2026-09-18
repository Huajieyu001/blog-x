ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_event_check";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_event_check" CHECK ("event" in ('auth.login.succeeded', 'auth.logout.succeeded', 'auth.password.changed', 'media.deleted', 'article.created', 'article.updated', 'article.revision.restored', 'article.published', 'article.unpublished', 'article.republished', 'article.deleted', 'article.scheduled', 'article.rescheduled', 'article.schedule_cancelled', 'article.scheduled_published', 'category.created', 'category.updated', 'category.deleted', 'tag.created', 'tag.updated', 'tag.deleted', 'about.saved', 'about.published', 'site_settings.updated'));--> statement-breakpoint
CREATE TABLE "article_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"source_version" timestamp (3) with time zone NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"actor_administrator_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_revisions_article_source_version_unique" ON "article_revisions" USING btree ("article_id","source_version");--> statement-breakpoint
CREATE INDEX "article_revisions_newest_index" ON "article_revisions" USING btree ("article_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
