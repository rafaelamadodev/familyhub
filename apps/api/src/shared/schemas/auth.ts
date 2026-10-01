import { z } from "zod";
export const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
export const credentialsSchema = z.object({ email: emailSchema, password: z.string().min(8).max(128) });
export const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(120) });
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  photoUrl: z.string().max(5_000_000).nullable().optional(),
});
export const passwordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8).max(128),
});
