CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_administrator_id" uuid NOT NULL,
	"event" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_event_check" CHECK ("audit_events"."event" in ('auth.login.succeeded', 'auth.logout.succeeded', 'article.created', 'article.updated', 'article.published', 'article.unpublished', 'article.republished', 'article.deleted', 'category.created', 'category.updated', 'category.deleted', 'tag.created', 'tag.updated', 'tag.deleted', 'about.saved', 'about.published')),
	CONSTRAINT "audit_events_target_check" CHECK ((
    ("audit_events"."event" in ('auth.login.succeeded', 'auth.logout.succeeded') and "audit_events"."target_type" = 'administrator' and "audit_events"."target_id" = "audit_events"."actor_administrator_id")
    or ("audit_events"."event" like 'article.%' and "audit_events"."target_type" = 'article' and "audit_events"."target_id" is not null)
    or ("audit_events"."event" like 'category.%' and "audit_events"."target_type" = 'category' and "audit_events"."target_id" is not null)
    or ("audit_events"."event" like 'tag.%' and "audit_events"."target_type" = 'tag' and "audit_events"."target_id" is not null)
    or ("audit_events"."event" like 'about.%' and "audit_events"."target_type" = 'about' and "audit_events"."target_id" is not null)
  )),
	CONSTRAINT "audit_events_metadata_check" CHECK (jsonb_typeof("audit_events"."metadata") = 'object' and octet_length("audit_events"."metadata"::text) <= 2048)
);
--> statement-breakpoint
CREATE INDEX "audit_events_newest_index" ON "audit_events" USING btree ("occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);