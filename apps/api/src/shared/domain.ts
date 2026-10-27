import { z } from "zod";
import { DateTime } from "luxon";
import type { Prisma } from "../../generated/prisma/index.js";
import { db } from "../db.js";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const idParams = z.object({ id: z.string().uuid() });
export const familyQuery = z.object({ familyId: z.string().uuid() });
export const timezoneSchema = z
  .string()
  .refine((value) => DateTime.now().setZone(value).isValid, "Fuso horário inválido");
export const recurrenceSchema = z
  .string()
  .max(90)
  .regex(
    /^(DAILY|WEEKLY|MONTHLY)(;INTERVAL=([1-9]|[1-9][0-9]))?(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?$/,
  )
  .nullable();
export const prioritySchema = z.enum(["LOW", "NORMAL", "HIGH"]);
export const preferencesSchema = z
  .object({ tasks: z.boolean(), events: z.boolean(), shopping: z.boolean(), push: z.boolean() })
  .strict();
export const sensitiveModules = ["children", "health", "documents", "finance"] as const;

export async function membership(userId: string, familyId: string, write = false, sensitive?: string) {
  const member = await db.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId } },
    include: { family: true },
  });
  if (!member || member.status !== "ACTIVE" || (write && member.role === "VIEWER"))
    throw new HttpError(403, "Você não tem permissão nesta família");
  if (
    sensitive &&
    member.role !== "ADMIN" &&
    (member.role === "VIEWER" || !member.sensitivePermissions.includes(sensitive))
  )
    throw new HttpError(403, "Acesso ao módulo restrito");
  return member;
}
export async function administrator(userId: string, familyId: string) {
  const member = await membership(userId, familyId, true);
  if (member.role !== "ADMIN") throw new HttpError(403, "Somente administradores podem realizar esta ação");
  return member;
}
export function verified(user: { emailVerifiedAt: Date | null }) {
  if (!user.emailVerifiedAt) throw new HttpError(403, "Verifique seu e-mail para continuar");
}
export async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  familyId: string | null,
  action: string,
  entity: string,
  entityId?: string,
) {
  await tx.auditLog.create({ data: { actorId, familyId, action, entity, entityId } });
}
export function nextOccurrence(date: Date, recurrence: string, timezone: string) {
  const local = DateTime.fromJSDate(date, { zone: timezone });
  const [frequency, ...parameters] = recurrence.split(";");
  const options = Object.fromEntries(parameters.map((item) => item.split("="))) as Record<string, string>;
  const interval = Number(options.INTERVAL ?? 1);
  let next = local.plus(
    frequency === "DAILY"
      ? { days: interval }
      : frequency === "WEEKLY"
        ? { weeks: interval }
        : { months: interval },
  );
  if (frequency === "WEEKLY" && options.BYDAY) {
    const weekdays: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
    const valid = options.BYDAY.split(",")
      .map((day) => weekdays[day])
      .filter(Boolean)
      .sort((a, b) => a - b);
    const future = valid.find((day) => day > local.weekday);
    if (future) next = local.plus({ days: future - local.weekday });
    else if (valid.length) next = local.plus({ weeks: interval - 1, days: 7 - local.weekday + valid[0] });
  }
  if (options.UNTIL && next.toISODate()! > options.UNTIL) return next.toUTC().toJSDate();
  return next.toUTC().toJSDate();
}
export function weeklyEventDates(local: string, repeatUntil: string, repeatDays: string[], timezone: string) {
  const start = DateTime.fromISO(local.slice(0, 10), { zone: timezone });
  const end = DateTime.fromISO(repeatUntil, { zone: timezone });
  if (
    !start.isValid ||
    start.toISODate() !== local.slice(0, 10) ||
    !end.isValid ||
    end.toISODate() !== repeatUntil ||
    end < start ||
    end > start.plus({ days: 365 })
  )
    throw new HttpError(400, "A data final deve estar entre o início e um ano depois");
  const dayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const dates: string[] = [];
  for (let day = start; day <= end; day = day.plus({ days: 1 })) {
    if (repeatDays.includes(dayCodes[day.weekday - 1])) dates.push(`${day.toISODate()}${local.slice(10)}`);
  }
  if (!dates.length) throw new HttpError(400, "Nenhum dia selecionado ocorre nesse período");
  if (dates.length > 100) throw new HttpError(400, "Escolha um período com até 100 ocorrências");
  return dates;
}
export function dayBounds(timezone: string, now = new Date()) {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  return {
    start: local.startOf("day").toJSDate(),
    end: local.plus({ days: 1 }).startOf("day").toJSDate(),
    date: local.toISODate()!,
  };
}
export function localInstant(value: string, timezone: string) {
  const parsed = DateTime.fromISO(value, { zone: timezone });
  if (!parsed.isValid || (value.length === 16 && parsed.toFormat("yyyy-MM-dd'T'HH:mm") !== value))
    throw new HttpError(400, "Data/hora inválida no fuso da família");
  return parsed.toUTC().toJSDate();
}
export async function childAccess(
  userId: string,
  familyId: string,
  childId: string | null | undefined,
  module: string,
) {
  if (!childId) return;
  const member = await membership(userId, familyId, false, "children");
  const child = await db.childProfile.findFirst({ where: { id: childId, familyId } });
  if (!child) throw new HttpError(404, "Perfil não encontrado");
  if (child.blockedModules.includes(module))
    throw new HttpError(403, "Este módulo está bloqueado no perfil da criança");
  return { child, member };
}
