import type { AuditMetadata } from "@blog-x/contracts";
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendAuditEvent } from "../audit/audit-repository.js";
import * as schema from "../db/schema.js";

type Database = NodePgDatabase<typeof schema>;
type SiteSettingsInput = { name: string; description: string; publicInfo: string; version?: string | null };

export function createSiteSettingsRepository(db: Database) {
  const get = () => db.select().from(schema.siteSettings).where(eq(schema.siteSettings.singleton, true)).limit(1);

  async function save(input: SiteSettingsInput, actorAdministratorId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('blog-x-site-settings'))`);
      const current = (await tx.select().from(schema.siteSettings).where(eq(schema.siteSettings.singleton, true)).limit(1).for("update"))[0];
      if ((!current && input.version) || (current && input.version !== current.version.toISOString())) return { stale: true as const };
      const now = new Date(Math.max(Date.now(), (current?.version.getTime() ?? 0) + 1));
      const row = current
        ? (await tx.update(schema.siteSettings).set({ name: input.name, description: input.description, publicInfo: input.publicInfo, version: now, updatedAt: now }).where(eq(schema.siteSettings.id, current.id)).returning())[0]!
        : (await tx.insert(schema.siteSettings).values({ name: input.name, description: input.description, publicInfo: input.publicInfo, version: now }).returning())[0]!;
      const changedFields: AuditMetadata["changedFields"] = current
        ? (["name", "description", "publicInfo"] as const).filter((field) => current[field] !== input[field])
        : ["name", "description", "publicInfo"];
      await appendAuditEvent(tx, {
        actorAdministratorId,
        event: "site_settings.updated",
        targetType: "site_settings",
        targetId: row.id,
        metadata: { changedFields },
      });
      return { stale: false as const, row };
    });
  }

  return { get, save };
}

export type SiteSettingsRepository = ReturnType<typeof createSiteSettingsRepository>;
