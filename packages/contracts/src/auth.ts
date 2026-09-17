import { z } from "zod";

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(1024),
}).strict();

export const loginResponseSchema = z.object({ ok: z.literal(true) }).strict();

export const sessionStatusSchema = z.object({ authenticated: z.literal(true) }).strict();
export const logoutResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(12).max(1024),
}).strict().refine((value) => value.currentPassword !== value.newPassword, { message: "new password must differ", path: ["newPassword"] });
export const changePasswordResponseSchema = z.object({ ok: z.literal(true) }).strict();

export type LoginInput = z.infer<typeof loginInputSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
