CREATE TABLE "site_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"name" text DEFAULT 'Blog X' NOT NULL,
	"description" text DEFAULT '记录代码、系统与长期实践。' NOT NULL,
	"public_info" text DEFAULT '' NOT NULL,
	"registration_number" text DEFAULT '黔ICP备2023015906号' NOT NULL,
	"version" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_name_check" CHECK (length(btrim("site_settings"."name")) > 0),
	CONSTRAINT "site_settings_registration_number_check" CHECK ("site_settings"."registration_number" = '黔ICP备2023015906号')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "site_settings_singleton_unique" ON "site_settings" USING btree ("singleton");
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_event_check";
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_target_check";
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_event_check" CHECK ("audit_events"."event" in ('auth.login.succeeded', 'auth.logout.succeeded', 'auth.password.changed', 'media.deleted', 'article.created', 'article.updated', 'article.published', 'article.unpublished', 'article.republished', 'article.deleted', 'article.scheduled', 'article.rescheduled', 'article.schedule_cancelled', 'article.scheduled_published', 'category.created', 'category.updated', 'category.deleted', 'tag.created', 'tag.updated', 'tag.deleted', 'about.saved', 'about.published', 'site_settings.updated'));
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_check" CHECK ((
  ("audit_events"."event" in ('auth.login.succeeded', 'auth.logout.succeeded', 'auth.password.changed') and "audit_events"."target_type" = 'administrator' and "audit_events"."target_id" = "audit_events"."actor_administrator_id")
  or ("audit_events"."event" = 'media.deleted' and "audit_events"."target_type" = 'media' and "audit_events"."target_id" is not null and "audit_events"."metadata" = '{}'::jsonb)
  or ("audit_events"."event" like 'article.%' and "audit_events"."target_type" = 'article' and "audit_events"."target_id" is not null)
  or ("audit_events"."event" like 'category.%' and "audit_events"."target_type" = 'category' and "audit_events"."target_id" is not null)
  or ("audit_events"."event" like 'tag.%' and "audit_events"."target_type" = 'tag' and "audit_events"."target_id" is not null)
  or ("audit_events"."event" like 'about.%' and "audit_events"."target_type" = 'about' and "audit_events"."target_id" is not null)
  or ("audit_events"."event" = 'site_settings.updated' and "audit_events"."target_type" = 'site_settings' and "audit_events"."target_id" is not null)
));
