CREATE TABLE "article_daily_views" (
	"article_id" uuid NOT NULL,
	"day" date NOT NULL,
	"total_pv" integer DEFAULT 0 NOT NULL,
	"direct_pv" integer DEFAULT 0 NOT NULL,
	"internal_pv" integer DEFAULT 0 NOT NULL,
	"search_pv" integer DEFAULT 0 NOT NULL,
	"social_pv" integer DEFAULT 0 NOT NULL,
	"external_pv" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "article_daily_views_pkey" PRIMARY KEY("article_id","day"),
	CONSTRAINT "article_daily_views_counters_nonnegative_check" CHECK ("article_daily_views"."total_pv" >= 0 and "article_daily_views"."direct_pv" >= 0 and "article_daily_views"."internal_pv" >= 0 and "article_daily_views"."search_pv" >= 0 and "article_daily_views"."social_pv" >= 0 and "article_daily_views"."external_pv" >= 0),
	CONSTRAINT "article_daily_views_total_matches_sources_check" CHECK ("article_daily_views"."total_pv" = "article_daily_views"."direct_pv" + "article_daily_views"."internal_pv" + "article_daily_views"."search_pv" + "article_daily_views"."social_pv" + "article_daily_views"."external_pv")
);
--> statement-breakpoint
ALTER TABLE "article_daily_views" ADD CONSTRAINT "article_daily_views_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_daily_views_day_index" ON "article_daily_views" USING btree ("day","article_id");