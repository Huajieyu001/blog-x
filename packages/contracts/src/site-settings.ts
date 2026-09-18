import { z } from "zod";

export const defaultSiteSettings = {
  name: "Blog X",
  description: "记录代码、系统与长期实践。",
  publicInfo: "",
  registrationNumber: "黔ICP备2023015906号",
  registrationUrl: "https://beian.miit.gov.cn/",
} as const;

const siteSettingsFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(320),
  publicInfo: z.string().trim().max(1_000),
}).strict();

export const siteSettingsInputSchema = siteSettingsFieldsSchema.extend({
  version: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

export const adminSiteSettingsSchema = siteSettingsFieldsSchema.extend({
  id: z.uuid(),
  registrationNumber: z.literal(defaultSiteSettings.registrationNumber),
  registrationUrl: z.literal(defaultSiteSettings.registrationUrl),
  version: z.string().datetime({ offset: true }),
}).strict();

export const publicSiteSettingsSchema = siteSettingsFieldsSchema.extend({
  registrationNumber: z.literal(defaultSiteSettings.registrationNumber),
  registrationUrl: z.literal(defaultSiteSettings.registrationUrl),
}).strict();

export const staleSiteSettingsVersionSchema = z.object({ error: z.literal("stale_version") }).strict();

export type AdminSiteSettings = z.infer<typeof adminSiteSettingsSchema>;
export type PublicSiteSettings = z.infer<typeof publicSiteSettingsSchema>;
