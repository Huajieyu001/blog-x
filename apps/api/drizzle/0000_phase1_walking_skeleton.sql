CREATE TABLE "administrators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"markdown" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"administrator_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_administrator_id_administrators_id_fk" FOREIGN KEY ("administrator_id") REFERENCES "public"."administrators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "administrators_username_unique" ON "administrators" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_slug_reserved_unique" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "articles_public_index" ON "articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_digest_unique" ON "sessions" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "sessions_expiry_index" ON "sessions" USING btree ("expires_at");