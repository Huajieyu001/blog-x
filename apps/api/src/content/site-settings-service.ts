import { adminSiteSettingsSchema, defaultSiteSettings, publicSiteSettingsSchema } from "@blog-x/contracts";
import type { SiteSettingsRepository } from "./site-settings-repository.js";

function publicValue(row?: { name: string; description: string; publicInfo: string }) {
  return publicSiteSettingsSchema.parse({ ...defaultSiteSettings, ...row });
}

export function createSiteSettingsService(repository: SiteSettingsRepository) {
  return {
    getPublic: async () => publicValue((await repository.get())[0]),
    getAdmin: async () => {
      const row = (await repository.get())[0];
      return row ? adminSiteSettingsSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        publicInfo: row.publicInfo,
        registrationNumber: row.registrationNumber,
        registrationUrl: defaultSiteSettings.registrationUrl,
        version: row.version.toISOString(),
      }) : null;
    },
    save: async (input: { name: string; description: string; publicInfo: string; version?: string | null }, actorAdministratorId: string) => {
      const result = await repository.save(input, actorAdministratorId);
      if (result.stale) return result;
      return {
        stale: false as const,
        settings: adminSiteSettingsSchema.parse({
          id: result.row.id,
          name: result.row.name,
          description: result.row.description,
          publicInfo: result.row.publicInfo,
          registrationNumber: result.row.registrationNumber,
          registrationUrl: defaultSiteSettings.registrationUrl,
          version: result.row.version.toISOString(),
        }),
      };
    },
  };
}

export type SiteSettingsService = ReturnType<typeof createSiteSettingsService>;
