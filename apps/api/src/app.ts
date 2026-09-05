import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  publishInputSchema,
  publishedArticleSchema,
} from "@blog-x/contracts";
import cookie from "@fastify/cookie";
import { drizzle } from "drizzle-orm/node-postgres";
import Fastify, { type FastifyInstance, type FastifyLoggerOptions, type FastifyPluginAsync } from "fastify";
import { Pool } from "pg";
import { administrators, articleDailyViews, articleTags, articles, auditEvents, categories, media, sessions, sitePages, tags } from "./db/schema.js";
import { seedAdministrator } from "./db/seed-admin.js";
import { authRoutes } from "./routes/auth.js";
import { createSessionService } from "./auth/sessions.js";
import { createAdminPostRepository } from "./content/admin-repository.js";
import { createArticleService } from "./content/article-service.js";
import { createScheduledPublisher, publishDueMaximumLimit, type PublishDueResult, ScheduledPublicationError } from "./content/scheduled-publisher.js";
import { classifyArticleMedia } from "./content/media-reference-policy.js";
import { adminPostRoutes } from "./routes/admin-posts.js";
import { createPublicRepository } from "./content/public-repository.js";
import { publicPostRoutes } from "./routes/public-posts.js";
import { createTaxonomyRepository } from "./content/taxonomy-repository.js";
import { createTaxonomyService } from "./content/taxonomy-service.js";
import { taxonomyRoutes } from "./routes/taxonomy.js";
import { publicTaxonomyRoutes } from "./routes/public-taxonomy.js";
import { createPageRepository } from "./content/page-repository.js";
import { createPageService } from "./content/page-service.js";
import { pageRoutes } from "./routes/pages.js";
import { publicPageRoutes } from "./routes/public-pages.js";
import { LocalMediaStorage } from "./media/storage.js";
import { createMediaService } from "./content/media-service.js";
import { mediaRoutes } from "./routes/media.js";
import { createExportRepository } from "./content/export-repository.js";
import { adminExportRoutes } from "./routes/admin-export.js";
import { parseApiRuntimeConfig, type ApiRuntimeConfig, type RateLimitConfig } from "./security/config.js";
import { BoundedRateLimitStore, createRateLimitKey } from "./security/rate-limiter.js";
import { requireAdministratorMutation, requireContentType, type MutationGuardOptions } from "./security/mutation-guard.js";
import { writePortableExport } from "./ops/portable-export.js";
import { classifyRetainedLegacyMedia } from "./ops/legacy-media-migration.js";
import { appendAuditEvent, createAuditRepository } from "./audit/audit-repository.js";
import { adminAuditRoutes } from "./routes/admin-audit.js";
import { createViewAggregationRepository, type ViewAggregationRepository } from "./content/view-aggregation-repository.js";
import { formatCleanupViewsFailure, formatCleanupViewsResult, parseCleanupViewsArguments, runViewRetention } from "./content/view-retention.js";
import { publicViewRoutes } from "./routes/public-views.js";

const databaseSchema = { administrators, articles, articleDailyViews, sessions, categories, tags, articleTags, sitePages, media, auditEvents };

type PublishDueArguments = { ok: true; limit: number } | { ok: false; code: "invalid_arguments" };

type PublishDueFailure = {
  at: Date;
  limit?: number;
  code: "invalid_arguments" | "configuration_failed" | "invalid_candidate" | "transaction_failed";
};

/** Parsing happens before a pool is created so malformed local commands cannot touch PostgreSQL. */
export function parsePublishDueArguments(arguments_: string[]): PublishDueArguments {
  if (arguments_.length !== 1) return { ok: false, code: "invalid_arguments" };
  const match = /^--limit=(\d+)$/.exec(arguments_[0] ?? "");
  if (!match) return { ok: false, code: "invalid_arguments" };
  const limit = Number(match[1]);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= publishDueMaximumLimit
    ? { ok: true, limit }
    : { ok: false, code: "invalid_arguments" };
}

export function formatPublishDueSuccess(result: PublishDueResult) {
  return JSON.stringify({
    format: "blog-x-publish-due",
    version: 1,
    command: "publish-due",
    at: result.at.toISOString(),
    limit: result.limit,
    claimed: result.claimed,
    published: result.publishedIds.length,
    publishedIds: result.publishedIds,
  });
}

export function formatPublishDueFailure(failure: PublishDueFailure) {
  return JSON.stringify({
    format: "blog-x-publish-due",
    version: 1,
    command: "publish-due",
    at: failure.at.toISOString(),
    ...(failure.limit === undefined ? {} : { limit: failure.limit }),
    code: failure.code,
  });
}

export function createRuntimeResources(config: ApiRuntimeConfig) {
  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = drizzle({ client: pool, schema: databaseSchema });
  return { pool, db };
}

type RuntimeResources = ReturnType<typeof createRuntimeResources>;

export function closeRuntimeResourcesOnAppClose(
  app: FastifyInstance,
  resources: Pick<RuntimeResources, "pool">,
) {
  let closed = false;
  app.addHook("onClose", async () => {
    if (closed) return;
    closed = true;
    await resources.pool.end();
  });
}

type BuildAppOptions = {
  logger?: FastifyLoggerOptions;
  publicOrigin?: string;
  mediaRoot?: string;
  resources?: RuntimeResources;
  rateLimits?: RateLimitConfig;
  trustedProxyAddresses?: string[];
  rateStore?: BoundedRateLimitStore;
  viewAggregationRepository?: ViewAggregationRepository;
};

export async function buildApp(options: BuildAppOptions = {}) {
  // buildApp remains the test seam. Production entry always passes resources
  // created only after parseApiRuntimeConfig has accepted its environment.
  const resources = options.resources ?? createRuntimeResources(parseApiRuntimeConfig(process.env, "migrate"));
  const db = resources.db;
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  const secureCookies = process.env.NODE_ENV === "production" || publicOrigin?.startsWith("https://") === true;
  const rateLimits = options.rateLimits ?? parseApiRuntimeConfig(process.env, "migrate").rateLimits;
  const trustedProxyAddresses = options.trustedProxyAddresses ?? parseApiRuntimeConfig(process.env, "migrate").trustedProxyAddresses;
  const rateStore = options.rateStore ?? new BoundedRateLimitStore(undefined, rateLimits.storeCapacity);
  const app = Fastify({
    // The API has no public host port. Only its exact configured Web proxy may
    // pass the canonical client address supplied by authenticated ingress.
    trustProxy: trustedProxyAddresses,
    logger: {
      level: options.logger?.level ?? (process.env.NODE_ENV === "production" ? "info" : "silent"),
      ...options.logger,
      redact: ["req.headers.cookie", "req.headers.authorization", "req.headers.x-blog-x-ingress-auth", "req.headers.x-blog-x-client-ip", "res.headers.set-cookie", "password", "token", "credentials"],
    },
  });
  // TypeScript 7's bundler resolution does not model the package's CommonJS
  // `export =` declaration as an ESM Fastify plugin, though the runtime shape is compatible.
  await app.register(cookie as unknown as FastifyPluginAsync);
  app.decorate("sessionAuth", createSessionService(db));
  app.addHook("onRequest", async (request, reply) => {
    // Protected mutations deliberately defer to the shared guard so an
    // unauthenticated request is always answered before any Origin/rate detail.
    if (request.method !== "GET" && request.method !== "HEAD") return;
    const decision = rateStore.consume(createRateLimitKey("request", request.ip), rateLimits.request);
    if (!decision.allowed) {
      reply.header("cache-control", "no-store");
      reply.header("retry-after", String(decision.retryAfterSeconds));
      return reply.code(429).send({ error: "too_many_requests" });
    }
  });
  const mutationGuard: MutationGuardOptions = {
    sessionAuth: app.sessionAuth,
    publicOrigin,
    rateStore,
    ratePolicy: rateLimits.administratorMutation,
  };
  app.get("/health", async () => ({ ok: true }));
  await app.register(authRoutes, {
    db,
    sessionAuth: app.sessionAuth,
    publicOrigin,
    secureCookies,
    loginRatePolicy: rateLimits.login,
    rateStore,
    mutationGuard,
  });
  await app.register(adminAuditRoutes, {
    auditRepository: createAuditRepository(db),
    sessionAuth: app.sessionAuth,
  });
  await app.register(adminPostRoutes, {
    articleService: createArticleService(createAdminPostRepository(db)),
    sessionAuth: app.sessionAuth,
    publicOrigin,
    mutationGuard,
  });
  await app.register(adminExportRoutes, {
    exportRepository: createExportRepository(db),
    sessionAuth: app.sessionAuth,
    publicOrigin,
    mutationGuard,
  });
  await app.register(publicPostRoutes, {
    publicRepository: createPublicRepository(db),
  });
  await app.register(publicViewRoutes, {
    publicOrigin,
    viewAggregationRepository: options.viewAggregationRepository ?? createViewAggregationRepository(db),
  });
  const taxonomyRepository = createTaxonomyRepository(db);
  await app.register(taxonomyRoutes, { taxonomyService: createTaxonomyService(taxonomyRepository), sessionAuth: app.sessionAuth, publicOrigin, mutationGuard });
  await app.register(publicTaxonomyRoutes, { taxonomyRepository });
  const pageRepository = createPageRepository(db);
  await app.register(pageRoutes, { pageService: createPageService(pageRepository), sessionAuth: app.sessionAuth, publicOrigin, mutationGuard });
  await app.register(publicPageRoutes, { pageRepository });
  const mediaStorage = new LocalMediaStorage(options.mediaRoot ?? process.env.MEDIA_ROOT ?? resolve(process.cwd(), "uploads"));
  await app.register(mediaRoutes, {
    mediaService: createMediaService(db, mediaStorage),
    sessionAuth: app.sessionAuth,
    publicOrigin,
    mutationGuard,
  });
  app.post("/articles/publish", { bodyLimit: 256 * 1024 }, async (request, reply) => {
    const administratorId = await requireAdministratorMutation(request, reply, mutationGuard);
    if (!administratorId) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = publishInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid article" });
    const media = classifyArticleMedia({ markdown: parsed.data.markdown, coverUrl: "" });
    if (media.invalidMarkdownSources.length) {
      return reply.code(400).send({
        error: "validation_failed",
        fields: { markdown: ["图片只能使用已上传媒体的 /media/<uuid> 地址"] },
      });
    }
    try {
      const article = await db.transaction(async (tx) => {
        const now = new Date();
        const inserted = await tx.insert(articles).values({ ...parsed.data, status: "published", legacyMediaReview: "clear", publishedAt: now, updatedAt: now }).returning({ id: articles.id, slug: articles.slug, title: articles.title, publishedAt: articles.publishedAt });
        const created = inserted[0];
        if (!created) throw new Error("published article was not persisted");
        await appendAuditEvent(tx, { actorAdministratorId: administratorId, event: "article.published", targetType: "article", targetId: created.id, metadata: { status: "published" } });
        return created;
      });
      if (!article?.publishedAt) throw new Error("published article was not persisted");
      return publishedArticleSchema.parse({ title: article.title, slug: article.slug, publishedAt: article.publishedAt.toISOString() });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "slug already reserved" });
      throw error;
    }
  });
  return app;
}

async function migrate(pool: Pool) {
  const migrationDirectory = fileURLToPath(new URL("../drizzle/", import.meta.url));
  const migrationFiles = (await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const fingerprint = createHash("sha256");
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('blog-x-phase1-migration'))");
    if (process.env.BLOG_X_MIGRATION_HOLD_MS) {
      const holdMs = Number(process.env.BLOG_X_MIGRATION_HOLD_MS);
      if (!Number.isInteger(holdMs) || holdMs < 0 || holdMs > 60_000) throw new Error("BLOG_X_MIGRATION_HOLD_MS must be an integer from 0 to 60000");
      console.log("migration lock acquired");
      await new Promise((accept) => setTimeout(accept, holdMs));
    }
    for (const migrationFile of migrationFiles) {
      const migration = await readFile(`${migrationDirectory}/${migrationFile}`, "utf8");
      fingerprint.update(migrationFile).update("\0").update(migration).update("\0");
      for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
        try {
          await client.query(statement);
        } catch (error: unknown) {
          if (!["42P07", "42701", "42710"].includes((error as { code?: string }).code ?? "")) throw error;
        }
      }
    }
    await client.query("begin");
    try {
      await classifyRetainedLegacyMedia(client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
    await client.query("create table if not exists blog_x_schema_ledger (scope text primary key, migration_count integer not null, migration_fingerprint text not null, applied_at timestamp with time zone not null default now())");
    await client.query("insert into blog_x_schema_ledger (scope, migration_count, migration_fingerprint) values ('phase1', $1, $2) on conflict (scope) do update set migration_count = excluded.migration_count, migration_fingerprint = excluded.migration_fingerprint, applied_at = now()", [migrationFiles.length, fingerprint.digest("hex")]);
  } finally { await client.query("select pg_advisory_unlock(hashtext('blog-x-phase1-migration'))").catch(() => undefined); client.release(); }
}
async function seed(db: RuntimeResources["db"], administrator: { username: string; password: string }) {
  await seedAdministrator(db, administrator);
}
async function schemaVerify(pool: Pool) {
  const result = await pool.query("select tablename from pg_tables where schemaname = 'public' and tablename = any($1)", [["administrators", "sessions", "articles", "article_daily_views", "categories", "tags", "article_tags", "site_pages", "media", "audit_events"]]);
  if (result.rowCount !== 10) throw new Error("view aggregate schema is not active; run pnpm db:migrate first");
  const ledger = await pool.query("select migration_count from blog_x_schema_ledger where scope = 'phase1'");
  if (ledger.rowCount !== 1 || Number(ledger.rows[0]?.migration_count) !== 10) throw new Error("view aggregate migration ledger is incomplete; run pnpm db:migrate first");
  const indices = await pool.query("select indexname from pg_indexes where schemaname = 'public' and indexname = any($1)", [["taxonomy_category_slug_unique", "taxonomy_tag_slug_unique", "article_tags_article_tag_unique", "articles_category_public_index", "site_pages_key_unique", "media_source_key_unique", "media_derivative_key_unique", "articles_cover_media_index", "audit_events_newest_index", "articles_schedule_due_index", "article_daily_views_day_index"]]);
  if (indices.rowCount !== 11) throw new Error("required indexes are incomplete; run pnpm db:migrate first");
  const viewConstraints = await pool.query("select conname from pg_constraint where conrelid = 'article_daily_views'::regclass and conname = any($1)", [["article_daily_views_pkey", "article_daily_views_article_id_articles_id_fk", "article_daily_views_counters_nonnegative_check", "article_daily_views_total_matches_sources_check"]]);
  if (viewConstraints.rowCount !== 4) throw new Error("view aggregate constraints are incomplete; run pnpm db:migrate first");
  const constraints = await pool.query("select conname from pg_constraint where conrelid = 'site_pages'::regclass and conname = any($1)", [["site_pages_key_about_check", "site_pages_status_check"]]);
  if (constraints.rowCount !== 2) throw new Error("site_pages singleton constraints are incomplete; run pnpm db:migrate first");
  const auditConstraints = await pool.query("select conname from pg_constraint where conrelid = 'audit_events'::regclass and conname = any($1)", [["audit_events_event_check", "audit_events_target_check", "audit_events_metadata_check"]]);
  if (auditConstraints.rowCount !== 3) throw new Error("audit constraints are incomplete; run pnpm db:migrate first");
  const mediaConstraints = await pool.query("select conname from pg_constraint where conname = any($1)", [["media_source_mime_check", "media_derivative_mime_check", "media_dimensions_check", "media_bytes_check", "articles_cover_alt_check", "articles_cover_media_id_media_id_fk"]]);
  if (mediaConstraints.rowCount !== 6) throw new Error("media constraints are incomplete; run pnpm db:migrate first");
  const legacyMedia = await pool.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = 'legacy_media_review'");
  if (legacyMedia.rowCount !== 1) throw new Error("legacy media review column is incomplete; run pnpm db:migrate first");
  const legacyConstraint = await pool.query("select conname from pg_constraint where conrelid = 'articles'::regclass and conname = 'articles_legacy_media_review_check'");
  if (legacyConstraint.rowCount !== 1) throw new Error("legacy media review constraint is incomplete; run pnpm db:migrate first");
  const scheduleColumns = await pool.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = any($1)", [["scheduled_at", "scheduled_by_administrator_id"]]);
  if (scheduleColumns.rowCount !== 2) throw new Error("scheduled publishing columns are incomplete; run pnpm db:migrate first");
  const scheduleConstraints = await pool.query("select conname from pg_constraint where conrelid = 'articles'::regclass and conname = any($1)", [["articles_schedule_pair_check", "articles_schedule_draft_check"]]);
  if (scheduleConstraints.rowCount !== 2) throw new Error("scheduled publishing constraints are incomplete; run pnpm db:migrate first");
  const auditEventConstraint = await pool.query<{ definition: string }>("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'audit_events'::regclass and conname = 'audit_events_event_check'");
  const auditDefinition = auditEventConstraint.rows[0]?.definition ?? "";
  if (auditEventConstraint.rowCount !== 1 || !["article.scheduled", "article.rescheduled", "article.schedule_cancelled", "article.scheduled_published"].every((event) => auditDefinition.includes(event))) {
    throw new Error("scheduled audit event constraint is incomplete; run pnpm db:migrate first");
  }
  const pending = await pool.query("select count(*)::int as count from articles where deleted_at is null and legacy_media_review = 'pending'");
  if (Number(pending.rows[0]?.count) !== 0) throw new Error("retained articles still await legacy media classification; run pnpm db:migrate first");
}
async function main() {
  const command = process.argv[2];
  if (command === "cleanup-views") {
    const parsed = parseCleanupViewsArguments(process.argv.slice(3));
    if (!parsed.ok) {
      console.error(formatCleanupViewsFailure(parsed.code));
      process.exitCode = 1;
      return;
    }
    let resources: RuntimeResources | undefined;
    try {
      resources = createRuntimeResources(parseApiRuntimeConfig(process.env, "cleanup-views"));
      console.log(formatCleanupViewsResult(await runViewRetention(createViewAggregationRepository(resources.db), parsed.limit)));
    } catch {
      console.error(formatCleanupViewsFailure(resources ? "cleanup_failed" : "configuration_failed"));
      process.exitCode = 1;
    } finally {
      await resources?.pool.end().catch(() => undefined);
    }
    return;
  }
  if (command === "publish-due") {
    const parsed = parsePublishDueArguments(process.argv.slice(3));
    if (!parsed.ok) {
      console.error(formatPublishDueFailure({ at: new Date(), code: parsed.code }));
      process.exitCode = 1;
      return;
    }
    let resources: RuntimeResources | undefined;
    try {
      const config = parseApiRuntimeConfig(process.env, "publish-due");
      resources = createRuntimeResources(config);
      const result = await createScheduledPublisher(createAdminPostRepository(resources.db)).publishDue(parsed.limit);
      console.log(formatPublishDueSuccess(result));
    } catch (error) {
      const code = error instanceof ScheduledPublicationError && error.code === "invalid_candidate"
        ? "invalid_candidate"
        : resources ? "transaction_failed" : "configuration_failed";
      console.error(formatPublishDueFailure({ at: new Date(), limit: parsed.limit, code }));
      process.exitCode = 1;
    } finally {
      await resources?.pool.end().catch(() => undefined);
    }
    return;
  }
  const configCommand = command === "migrate" || command === "seed" || command === "schema:verify" || command === "portable-export" ? command : "serve";
  const config = parseApiRuntimeConfig(process.env, configCommand);
  const resources = createRuntimeResources(config);
  if (command === "migrate" || command === "seed" || command === "schema:verify" || command === "portable-export") {
    try {
      if (command === "migrate") await migrate(resources.pool);
      if (command === "seed") await seed(resources.db, config.administrator!);
      if (command === "schema:verify") await schemaVerify(resources.pool);
      if (command === "portable-export") await writePortableExport(resources.db);
    } finally {
      await resources.pool.end();
    }
    return;
  }
  let app: FastifyInstance | undefined;
  try {
    app = await buildApp({
      resources,
      publicOrigin: config.publicOrigin,
      mediaRoot: config.mediaRoot,
      rateLimits: config.rateLimits,
      trustedProxyAddresses: config.trustedProxyAddresses,
    });
    closeRuntimeResourcesOnAppClose(app, resources);
    await app.listen({ host: config.apiHost, port: config.apiPort });
  } catch (error) {
    if (app) await app.close().catch(() => undefined);
    else await resources.pool.end().catch(() => undefined);
    throw error;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((error) => { console.error(error instanceof Error ? error.message : "startup failed"); process.exitCode = 1; });
