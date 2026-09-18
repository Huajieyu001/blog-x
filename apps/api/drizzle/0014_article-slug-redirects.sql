CREATE TABLE "article_slug_redirects" (
	"from_slug" text PRIMARY KEY NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_slug_redirects_from_slug_check" CHECK (length(btrim("article_slug_redirects"."from_slug")) > 0)
);
--> statement-breakpoint
ALTER TABLE "article_slug_redirects" ADD CONSTRAINT "article_slug_redirects_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_slug_redirects_article_index" ON "article_slug_redirects" USING btree ("article_id");
