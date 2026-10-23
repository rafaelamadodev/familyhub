import { API_URL, apiRequest, send } from "./client";
export type Member = {
  id: string;
  userId: string;
  role: "ADMIN" | "MEMBER" | "VIEWER";
  sensitivePermissions: string[];
  user: { id: string; name: string; photoUrl: string | null };
};
export type Task = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  assigneeId: string | null;
  assignee?: { name: string } | null;
  priority: string;
  status: string;
  recurrence: string | null;
};
export type ShoppingItem = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  note: string | null;
  priority: string;
  checked: boolean;
};
export type ShoppingList = { id: string; name: string; status: string; items: ShoppingItem[] };
export type FamilyEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  dateOnly: string | null;
  allDay: boolean;
  location: string | null;
  status: string;
  reminderMinutes: number | null;
  participants: { userId: string }[];
};
export const domainApi = {
  list: <T>(path: string, familyId: string, query = "") =>
    apiRequest<T>("/api/v1/" + path + "?familyId=" + familyId + query),
  create: <T>(path: string, data: unknown) => send<T>("/api/v1/" + path, "POST", data),
  update: <T>(path: string, id: string, data: unknown) =>
    send<T>("/api/v1/" + path + "/" + id, "PATCH", data),
  remove: (path: string, id: string) => send("/api/v1/" + path + "/" + id, "DELETE"),
  members: (id: string) => apiRequest<Member[]>("/api/v1/families/" + id + "/members"),
};
export function localDateTime(date: string | null, timezone: string) {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(date));
  return parts.replace(" ", "T");
}
export function displayDate(date: string | null, timezone: string) {
  return date
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "short" }).format(
        new Date(date),
      )
    : "Sem prazo";
}
export function downloadData(data: unknown, filename: string, csv = false) {
  const url = URL.createObjectURL(
    new Blob([csv ? String(data) : JSON.stringify(data, null, 2)], {
      type: csv ? "text/csv;charset=utf-8" : "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadShoppingPdf(listId: string, includePurchased = false) {
  const response = await fetch(
    `${API_URL}/api/v1/shopping-lists/${listId}/pdf?includePurchased=${includePurchased}`,
    { credentials: "include" },
  );
  if (!response.ok)
    throw new Error((await response.json().catch(() => null))?.message ?? "Não foi possível gerar o PDF");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "lista-de-compras.pdf";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
