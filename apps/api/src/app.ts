import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Algorithm, hash, verify } from "@node-rs/argon2";
import cookie from "@fastify/cookie";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import Fastify, { type FastifyRequest } from "fastify";
import { Pool } from "pg";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { codeToHast } from "shiki";
import { unified } from "unified";
import { z } from "zod";
import { administrators, articles, sessions } from "./db/schema.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://blog_x@127.0.0.1:5432/blog_x";
const cookieName = process.env.NODE_ENV === "production" ? "__Host-blog_x_session" : "blog_x_session";
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool });
const loginInput = z.object({ username: z.string().min(1).max(120), password: z.string().min(1).max(1024) });
const publishInput = z.object({ title: z.string().trim().min(1).max(240), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180), markdown: z.string().trim().min(1).max(200_000) });

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function secureEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function originIsTrusted(request: FastifyRequest) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  return Boolean(host) && origin === `${request.protocol}://${host}`;
}
function noStore(reply: { header: (name: string, value: string) => unknown }) { reply.header("cache-control", "no-store"); }

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

async function currentAdministrator(request: FastifyRequest) {
  const token = request.cookies[cookieName];
  if (!token) return null;
  const row = await db.select({ administratorId: sessions.administratorId, tokenDigest: sessions.tokenDigest }).from(sessions).where(and(eq(sessions.tokenDigest, digest(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).limit(1);
  return row[0] && secureEqual(row[0].tokenDigest, digest(token)) ? row[0].administratorId : null;
}

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV === "production" });
  await app.register(cookie);
  app.get("/health", async () => ({ ok: true }));
  app.post("/auth/login", async (request, reply) => {
    noStore(reply);
    if (!originIsTrusted(request)) return reply.code(403).send({ error: "forbidden" });
    const parsed = loginInput.safeParse(request.body);
    if (!parsed.success) return reply.code(401).send({ error: "invalid credentials" });
    const admin = await db.select().from(administrators).where(eq(administrators.username, parsed.data.username)).limit(1);
    if (!admin[0] || !(await verify(admin[0].passwordHash, parsed.data.password))) return reply.code(401).send({ error: "invalid credentials" });
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.administratorId, admin[0].id));
    const token = randomBytes(32).toString("base64url");
    await db.insert(sessions).values({ administratorId: admin[0].id, tokenDigest: digest(token), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14) });
    reply.setCookie(cookieName, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14 });
    return { ok: true };
  });
  app.post("/articles/publish", async (request, reply) => {
    noStore(reply);
    if (!originIsTrusted(request)) return reply.code(403).send({ error: "forbidden" });
    if (!await currentAdministrator(request)) return reply.code(401).send({ error: "unauthorized" });
    const parsed = publishInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid article" });
    try {
      const now = new Date();
      const inserted = await db.insert(articles).values({ ...parsed.data, status: "published", publishedAt: now, updatedAt: now }).returning({ slug: articles.slug, title: articles.title, publishedAt: articles.publishedAt });
      return inserted[0];
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "slug already reserved" });
      throw error;
    }
  });
  app.get("/public/articles", async () => db.select({ title: articles.title, slug: articles.slug, publishedAt: articles.publishedAt }).from(articles).where(and(eq(articles.status, "published"), isNull(articles.deletedAt), sql`${articles.publishedAt} is not null`)).orderBy(desc(articles.publishedAt)));
  app.get<{ Params: { slug: string } }>("/public/articles/:slug", async (request, reply) => {
    const article = await db.select().from(articles).where(and(eq(articles.slug, request.params.slug), eq(articles.status, "published"), isNull(articles.deletedAt), sql`${articles.publishedAt} is not null`)).limit(1);
    if (!article[0]) return reply.code(404).send({ error: "not found" });
    return { title: article[0].title, slug: article[0].slug, publishedAt: article[0].publishedAt, html: await renderMarkdown(article[0].markdown) };
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
  const username = process.env.ADMIN_USERNAME; const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required for seed");
  const passwordHash = await hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await db.insert(administrators).values({ username, passwordHash }).onConflictDoNothing();
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
  const app = await buildApp(); await app.listen({ host: "127.0.0.1", port: Number(process.env.API_PORT ?? 3001) });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(async (error) => { console.error(error instanceof Error ? error.message : "startup failed"); await pool.end(); process.exitCode = 1; });
