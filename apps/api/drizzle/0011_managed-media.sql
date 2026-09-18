ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_event_check";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_target_check";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "media_catalog_retained_index" ON "media" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "media"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_event_check" CHECK ("audit_events"."event" in ('auth.login.succeeded', 'auth.logout.succeeded', 'auth.password.changed', 'media.deleted', 'article.created', 'article.updated', 'article.published', 'article.unpublished', 'article.republished', 'article.deleted', 'article.scheduled', 'article.rescheduled', 'article.schedule_cancelled', 'article.scheduled_published', 'category.created', 'category.updated', 'category.deleted', 'tag.created', 'tag.updated', 'tag.deleted', 'about.saved', 'about.published'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_check" CHECK ((
    ("audit_events"."event" in ('auth.login.succeeded', 'auth.logout.succeeded', 'auth.password.changed') and "audit_events"."target_type" = 'administrator' and "audit_events"."target_id" = "audit_events"."actor_administrator_id")
    or ("audit_events"."event" = 'media.deleted' and "audit_events"."target_type" = 'media' and "audit_events"."target_id" is not null)
    or ("audit_events"."event" like 'article.%' and "audit_events"."target_type" = 'article' and "audit_events"."target_id" is not null)
    or ("audit_events"."event" like 'category.%' and "audit_events"."target_type" = 'category' and "audit_events"."target_id" is not null)
    or ("audit_events"."event" like 'tag.%' and "audit_events"."target_type" = 'tag' and "audit_events"."target_id" is not null)
    or ("audit_events"."event" like 'about.%' and "audit_events"."target_type" = 'about' and "audit_events"."target_id" is not null)
  ));