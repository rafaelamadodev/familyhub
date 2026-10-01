import { z } from "zod";
import { apiRequest, send } from "./client";
export const familySchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  avatarUrl: z.string().nullable(),
  notificationPreferences: z.record(z.boolean()).nullable().optional(),
});
export type Family = z.infer<typeof familySchema>;
export type Membership = {
  role: "ADMIN" | "MEMBER" | "VIEWER";
  sensitivePermissions: string[];
  family: Family;
};
export const familyApi = {
  list: () => apiRequest<Membership[]>("/api/v1/families"),
  create: (body: { name: string; timezone: string; avatarUrl?: string | null }) =>
    apiRequest("/api/v1/families", { method: "POST", body: JSON.stringify(body) }, familySchema),
  join: (joinCode: string) => send<{ family: Family }>("/api/v1/families/join", "POST", { joinCode }),
  update: (id: string, body: unknown) => send<Family>("/api/v1/families/" + id, "PATCH", body),
};
