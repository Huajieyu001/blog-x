import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  publicArticleDetailSchema,
  publicArticleListSchema,
  publishInputSchema,
  publishedArticleSchema,
} from "@blog-x/contracts";
import cookie from "@fastify/cookie";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import Fastify, { type FastifyLoggerOptions, type FastifyPluginAsync } from "fastify";
import { Pool } from "pg";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { codeToHast } from "shiki";
import { unified } from "unified";
import { administrators, articles, sessions } from "./db/schema.js";
import { seedAdministratorFromEnvironment } from "./db/seed-admin.js";
import { authRoutes } from "./routes/auth.js";
import { createSessionService, sessionCookieName } from "./auth/sessions.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://blog_x@127.0.0.1:5432/blog_x";
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool, schema: { administrators, articles, sessions } });

type HastNode = { type: string; tagName?: string; properties?: Record<string, unknown>; value?: string; children?: HastNode[] };
function textContent(node: HastNode): string { return node.value ?? node.children?.map(textContent).join("") ?? ""; }
async function highlightCode(tree: HastNode) {
  if (!tree.children) return;
  for (let index = 0; index < tree.children.length; index += 1) {
    const node = tree.children[index];
    if (node.tagName === "pre" && node.children?.[0]?.tagName === "code") {
      const code = node.children[0]; const className = code.properties?.className;
      const language = Array.isArray(className) ? className.find((name): name is string => typeof name === "string" && name.startsWith("language-"))?.slice(9) : undefined;
      if (language) try { tree.children.splice(index, 1, ...(await codeToHast(textContent(code), { lang: language, theme: "github-light" })).children as HastNode[]); continue; } catch { /* retained as escaped code */ }
    }
    await highlightCode(node);
  }
}
async function renderMarkdown(markdown: string) {
  const parser = unified().use(remarkParse).use(remarkGfm).use(remarkRehype, { allowDangerousHtml: false });
  const tree = await parser.run(parser.parse(markdown));
  await highlightCode(tree as HastNode);
  return String(await unified().use(rehypeSanitize).use(rehypeStringify).stringify(tree));
}

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
  app.get("/public/articles", async () => publicArticleListSchema.parse((await db.select({ title: articles.title, slug: articles.slug, publishedAt: articles.publishedAt }).from(articles).where(and(eq(articles.status, "published"), isNull(articles.deletedAt), sql`${articles.publishedAt} is not null`)).orderBy(desc(articles.publishedAt))).map((article) => {
    if (!article.publishedAt) throw new Error("public article is missing publishedAt");
    return { ...article, publishedAt: article.publishedAt.toISOString() };
  })));
  app.get<{ Params: { slug: string } }>("/public/articles/:slug", async (request, reply) => {
    const article = await db.select().from(articles).where(and(eq(articles.slug, request.params.slug), eq(articles.status, "published"), isNull(articles.deletedAt), sql`${articles.publishedAt} is not null`)).limit(1);
    if (!article[0]) return reply.code(404).send({ error: "not found" });
    if (!article[0].publishedAt) throw new Error("public article is missing publishedAt");
    return publicArticleDetailSchema.parse({ title: article[0].title, slug: article[0].slug, publishedAt: article[0].publishedAt.toISOString(), html: await renderMarkdown(article[0].markdown) });
  });
  return app;
}

async function migrate() {
  const migration = await readFile(fileURLToPath(new URL("../drizzle/0000_phase1_walking_skeleton.sql", import.meta.url)), "utf8");
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('blog-x-phase1-migration'))");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      try { await client.query(statement); } catch (error: unknown) { if ((error as { code?: string }).code !== "42P07") throw error; }
    }
  } finally { await client.query("select pg_advisory_unlock(hashtext('blog-x-phase1-migration'))").catch(() => undefined); client.release(); }
}
async function seed() {
  await seedAdministratorFromEnvironment(db);
}
async function schemaVerify() {
  const result = await pool.query("select tablename from pg_tables where schemaname = 'public' and tablename = any($1)", [["administrators", "sessions", "articles"]]);
  if (result.rowCount !== 3) throw new Error("phase 1 schema is not active; run pnpm db:migrate first");
}
async function main() {
  const command = process.argv[2];
  if (command === "migrate") { await migrate(); await pool.end(); return; }
  if (command === "seed") { await seed(); await pool.end(); return; }
  if (command === "schema:verify") { await schemaVerify(); await pool.end(); return; }
  if (!process.env.PUBLIC_ORIGIN) throw new Error("PUBLIC_ORIGIN is required when starting the API server");
  const app = await buildApp(); await app.listen({ host: "127.0.0.1", port: Number(process.env.API_PORT ?? 3001) });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(async (error) => { console.error(error instanceof Error ? error.message : "startup failed"); await pool.end(); process.exitCode = 1; });
