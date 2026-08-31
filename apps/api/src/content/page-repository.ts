import type { AuditMetadata } from "@blog-x/contracts";
import { desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { appendAuditEvent } from "../audit/audit-repository.js";
import { publicPredicate } from "./public-repository.js";
type Database = NodePgDatabase<typeof schema>;
export function createPageRepository(db: Database) {
  const about = () => db.select().from(schema.sitePages).where(eq(schema.sitePages.key, "about")).limit(1);
  async function save(input: { title: string; markdown: string; version?: string | null }, actorAdministratorId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('blog-x-about'))`);
      const current = (await tx.select().from(schema.sitePages).where(eq(schema.sitePages.key, "about")).limit(1).for("update"))[0];
      if ((!current && input.version) || (current && input.version !== current.version.toISOString())) return { stale: true as const };
      const now = new Date(Math.max(Date.now(), (current?.version.getTime() ?? 0) + 1));
      const row = current
        ? (await tx.update(schema.sitePages).set({ title: input.title, markdown: input.markdown, status: "draft", version: now, updatedAt: now }).where(eq(schema.sitePages.id, current.id)).returning())[0]!
        : (await tx.insert(schema.sitePages).values({ key: "about", title: input.title, markdown: input.markdown, status: "draft", version: now }).returning())[0]!;
      const changedFields: AuditMetadata["changedFields"] = current
        ? (["title", "markdown", "status"] as const).filter((field) => current[field] !== (field === "status" ? "draft" : input[field]))
        : ["title", "markdown", "status"];
      await appendAuditEvent(tx, {
        actorAdministratorId,
        event: "about.saved",
        targetType: "about",
        targetId: row.id,
        metadata: { changedFields, ...(current ? { previousStatus: current.status as "draft" | "published" } : {}), status: "draft" },
      });
      return { stale: false as const, row };
    });
  }
  async function publish(version: string, actorAdministratorId: string) {
    return db.transaction(async (tx) => {
      const current = (await tx.select().from(schema.sitePages).where(eq(schema.sitePages.key, "about")).limit(1).for("update"))[0];
      if (!current) return null;
      if (current.version.toISOString() !== version) return { stale: true as const };
      const now = new Date(Math.max(Date.now(), current.version.getTime()+1));
      const row = (await tx.update(schema.sitePages).set({ status: "published", version: now, updatedAt: now }).where(eq(schema.sitePages.id, current.id)).returning())[0]!;
      await appendAuditEvent(tx, {
        actorAdministratorId,
        event: "about.published",
        targetType: "about",
        targetId: row.id,
        metadata: {
          changedFields: current.status === row.status ? [] : ["status"],
          previousStatus: current.status as "draft" | "published",
          status: "published",
        },
      });
      return { stale: false as const, row };
    });
  }
  async function archive() { return db.transaction(async (tx) => { const rows = await tx.select({ title: schema.articles.title, slug: schema.articles.slug, publishedAt: schema.articles.publishedAt }).from(schema.articles).where(publicPredicate).orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id)); const formatter=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Shanghai",year:"numeric",month:"numeric"}); const groups = new Map<number, Map<number, typeof rows>>(); for (const row of rows) { const parts=formatter.formatToParts(row.publishedAt!); const year=Number(parts.find(p=>p.type==="year")!.value),month=Number(parts.find(p=>p.type==="month")!.value), months=groups.get(year)??new Map(); months.set(month,[...(months.get(month)??[]),row]); groups.set(year,months); } return [...groups.entries()].sort((a,b)=>b[0]-a[0]).map(([year,months])=>({year,months:[...months.entries()].sort((a,b)=>b[0]-a[0]).map(([month,items])=>({month,items:items.map(item=>({title:item.title,slug:item.slug,publishedAt:item.publishedAt!.toISOString()}))}))})); }, { isolationLevel:"repeatable read", accessMode:"read only" }); }
  return { about, save, publish, archive };
}
export type PageRepository = ReturnType<typeof createPageRepository>;
