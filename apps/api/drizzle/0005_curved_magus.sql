CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"derivative_key" text NOT NULL,
	"source_mime_type" text NOT NULL,
	"derivative_mime_type" text NOT NULL,
	"source_bytes" integer NOT NULL,
	"derivative_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_source_mime_check" CHECK ("media"."source_mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "media_derivative_mime_check" CHECK ("media"."derivative_mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "media_dimensions_check" CHECK ("media"."width" > 0 and "media"."height" > 0 and "media"."width" <= 2400 and "media"."height" <= 2400),
	CONSTRAINT "media_bytes_check" CHECK ("media"."source_bytes" > 0 and "media"."source_bytes" <= 5242880 and "media"."derivative_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "cover_alt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "cover_decorative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_source_key_unique" ON "media" USING btree ("source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_derivative_key_unique" ON "media" USING btree ("derivative_key");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_cover_media_index" ON "articles" USING btree ("cover_media_id");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_cover_alt_check" CHECK ("articles"."cover_media_id" is null or "articles"."cover_decorative" or length(btrim("articles"."cover_alt")) > 0);