import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  publishInputSchema,
  publishedArticleSchema,
} from "@blog-x/contracts";
import cookie from "@fastify/cookie";
import { drizzle } from "drizzle-orm/node-postgres";
import Fastify, { type FastifyLoggerOptions, type FastifyPluginAsync } from "fastify";
import { Pool } from "pg";
import { administrators, articleTags, articles, categories, sessions, sitePages, tags } from "./db/schema.js";
import { seedAdministratorFromEnvironment } from "./db/seed-admin.js";
import { authRoutes } from "./routes/auth.js";
import { createSessionService, sessionCookieName } from "./auth/sessions.js";
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

const databaseUrl = process.env.DATABASE_URL ?? "postgres://blog_x@127.0.0.1:5432/blog_x";
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool, schema: { administrators, articles, sessions, categories, tags, articleTags, sitePages } });

type BuildAppOptions = {
  logger?: FastifyLoggerOptions;
  publicOrigin?: string;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  const secureCookies = process.env.NODE_ENV === "production" || publicOrigin?.startsWith("https://") === true;
  const app = Fastify({
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
  app.get("/health", async () => ({ ok: true }));
  await app.register(authRoutes, {
    db,
    sessionAuth: app.sessionAuth,
    publicOrigin,
    secureCookies,
  });
  await app.register(adminPostRoutes, {
    articleService: createArticleService(createAdminPostRepository(db)),
    sessionAuth: app.sessionAuth,
    publicOrigin,
  });
  await app.register(publicPostRoutes, {
    publicRepository: createPublicRepository(db),
  });
  const taxonomyRepository = createTaxonomyRepository(db);
  await app.register(taxonomyRoutes, { taxonomyService: createTaxonomyService(taxonomyRepository), sessionAuth: app.sessionAuth, publicOrigin });
  await app.register(publicTaxonomyRoutes, { taxonomyRepository });
  const pageRepository = createPageRepository(db);
  await app.register(pageRoutes, { pageService: createPageService(pageRepository), sessionAuth: app.sessionAuth, publicOrigin });
  await app.register(publicPageRoutes, { pageRepository });
  app.post("/articles/publish", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (request.headers.origin !== publicOrigin) return reply.code(403).send({ error: "forbidden" });
    if (!await app.sessionAuth.administratorIdForToken(request.cookies[sessionCookieName])) return reply.code(401).send({ error: "unauthorized" });
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

async function migrate() {
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
async function seed() {
  await seedAdministratorFromEnvironment(db);
}
async function schemaVerify() {
  const result = await pool.query("select tablename from pg_tables where schemaname = 'public' and tablename = any($1)", [["administrators", "sessions", "articles", "categories", "tags", "article_tags", "site_pages"]]);
  if (result.rowCount !== 7) throw new Error("page schema is not active; run pnpm db:migrate first");
  const ledger = await pool.query("select migration_count from blog_x_schema_ledger where scope = 'phase1'");
  if (ledger.rowCount !== 1 || Number(ledger.rows[0]?.migration_count) !== 4) throw new Error("page migration ledger is incomplete; run pnpm db:migrate first");
  const indices = await pool.query("select indexname from pg_indexes where schemaname = 'public' and indexname = any($1)", [["taxonomy_category_slug_unique", "taxonomy_tag_slug_unique", "article_tags_article_tag_unique", "articles_category_public_index"]]);
  if (indices.rowCount !== 4) throw new Error("taxonomy indexes are incomplete; run pnpm db:migrate first");
}
async function main() {
  const command = process.argv[2];
  if (command === "migrate") { await migrate(); await pool.end(); return; }
  if (command === "seed") { await seed(); await pool.end(); return; }
  if (command === "schema:verify") { await schemaVerify(); await pool.end(); return; }
  if (!process.env.PUBLIC_ORIGIN) throw new Error("PUBLIC_ORIGIN is required when starting the API server");
  const app = await buildApp(); await app.listen({ host: process.env.API_HOST ?? "127.0.0.1", port: Number(process.env.API_PORT ?? 3001) });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(async (error) => { console.error(error instanceof Error ? error.message : "startup failed"); await pool.end(); process.exitCode = 1; });
