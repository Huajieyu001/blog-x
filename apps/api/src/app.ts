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
import { administrators, articleTags, articles, categories, media, sessions, sitePages, tags } from "./db/schema.js";
import { seedAdministrator } from "./db/seed-admin.js";
import { authRoutes } from "./routes/auth.js";
import { createSessionService } from "./auth/sessions.js";
import { createAdminPostRepository } from "./content/admin-repository.js";
import { createArticleService } from "./content/article-service.js";
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

const databaseSchema = { administrators, articles, sessions, categories, tags, articleTags, sitePages, media };

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
  rateStore?: BoundedRateLimitStore;
};

export async function buildApp(options: BuildAppOptions = {}) {
  // buildApp remains the test seam. Production entry always passes resources
  // created only after parseApiRuntimeConfig has accepted its environment.
  const resources = options.resources ?? createRuntimeResources(parseApiRuntimeConfig(process.env, "migrate"));
  const db = resources.db;
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  const secureCookies = process.env.NODE_ENV === "production" || publicOrigin?.startsWith("https://") === true;
  const rateLimits = options.rateLimits ?? parseApiRuntimeConfig(process.env, "migrate").rateLimits;
  const rateStore = options.rateStore ?? new BoundedRateLimitStore(undefined, rateLimits.storeCapacity);
  const app = Fastify({
    trustProxy: false,
    logger: {
      level: options.logger?.level ?? (process.env.NODE_ENV === "production" ? "info" : "silent"),
      ...options.logger,
      redact: ["req.headers.cookie", "req.headers.authorization", "res.headers.set-cookie", "password", "token", "credentials"],
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
    if (!await requireAdministratorMutation(request, reply, mutationGuard)) return;
    if (!requireContentType(request, reply, "application/json")) return;
    const parsed = publishInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid article" });
    try {
      const now = new Date();
      const inserted = await db.insert(articles).values({ ...parsed.data, status: "published", publishedAt: now, updatedAt: now }).returning({ slug: articles.slug, title: articles.title, publishedAt: articles.publishedAt });
      const article = inserted[0];
      if (!article?.publishedAt) throw new Error("published article was not persisted");
      return publishedArticleSchema.parse({ ...article, publishedAt: article.publishedAt.toISOString() });
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
    await client.query("create table if not exists blog_x_schema_ledger (scope text primary key, migration_count integer not null, migration_fingerprint text not null, applied_at timestamp with time zone not null default now())");
    await client.query("insert into blog_x_schema_ledger (scope, migration_count, migration_fingerprint) values ('phase1', $1, $2) on conflict (scope) do update set migration_count = excluded.migration_count, migration_fingerprint = excluded.migration_fingerprint, applied_at = now()", [migrationFiles.length, fingerprint.digest("hex")]);
  } finally { await client.query("select pg_advisory_unlock(hashtext('blog-x-phase1-migration'))").catch(() => undefined); client.release(); }
}
async function seed(db: RuntimeResources["db"], administrator: { username: string; password: string }) {
  await seedAdministrator(db, administrator);
}
async function schemaVerify(pool: Pool) {
  const result = await pool.query("select tablename from pg_tables where schemaname = 'public' and tablename = any($1)", [["administrators", "sessions", "articles", "categories", "tags", "article_tags", "site_pages", "media"]]);
  if (result.rowCount !== 8) throw new Error("media schema is not active; run pnpm db:migrate first");
  const ledger = await pool.query("select migration_count from blog_x_schema_ledger where scope = 'phase1'");
  if (ledger.rowCount !== 1 || Number(ledger.rows[0]?.migration_count) !== 6) throw new Error("media migration ledger is incomplete; run pnpm db:migrate first");
  const indices = await pool.query("select indexname from pg_indexes where schemaname = 'public' and indexname = any($1)", [["taxonomy_category_slug_unique", "taxonomy_tag_slug_unique", "article_tags_article_tag_unique", "articles_category_public_index", "site_pages_key_unique", "media_source_key_unique", "media_derivative_key_unique", "articles_cover_media_index"]]);
  if (indices.rowCount !== 8) throw new Error("required indexes are incomplete; run pnpm db:migrate first");
  const constraints = await pool.query("select conname from pg_constraint where conrelid = 'site_pages'::regclass and conname = any($1)", [["site_pages_key_about_check", "site_pages_status_check"]]);
  if (constraints.rowCount !== 2) throw new Error("site_pages singleton constraints are incomplete; run pnpm db:migrate first");
  const mediaConstraints = await pool.query("select conname from pg_constraint where conname = any($1)", [["media_source_mime_check", "media_derivative_mime_check", "media_dimensions_check", "media_bytes_check", "articles_cover_alt_check", "articles_cover_media_id_media_id_fk"]]);
  if (mediaConstraints.rowCount !== 6) throw new Error("media constraints are incomplete; run pnpm db:migrate first");
}
async function main() {
  const command = process.argv[2];
  const configCommand = command === "migrate" || command === "seed" || command === "schema:verify" ? command : "serve";
  const config = parseApiRuntimeConfig(process.env, configCommand);
  const resources = createRuntimeResources(config);
  if (command === "migrate" || command === "seed" || command === "schema:verify") {
    try {
      if (command === "migrate") await migrate(resources.pool);
      if (command === "seed") await seed(resources.db, config.administrator!);
      if (command === "schema:verify") await schemaVerify(resources.pool);
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
