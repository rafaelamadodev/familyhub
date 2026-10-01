import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import { audit, familyQuery, HttpError, idParams, localInstant, membership } from "../../shared/domain.js";
import { scheduleNotification } from "../notifications/service.js";
const fields = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().max(2000).nullable().optional(),
    startsAt: z.string().max(40),
    allDay: z.boolean().default(false),
    location: z.string().max(180).nullable().optional(),
    participantIds: z.array(z.string().uuid()).max(50).default([]),
    reminderMinutes: z.number().int().min(0).max(10080).nullable().optional(),
    status: z.enum(["SCHEDULED", "CANCELLED"]).default("SCHEDULED"),
  })
  .strict();
export async function registerEventRoutes(app: FastifyInstance) {
  app.get("/api/v1/events", async (request) => {
    const user = await requireUser(request);
    const { familyId } = familyQuery.parse(request.query);
    await membership(user.id, familyId);
    return db.familyEvent.findMany({
      where: { familyId },
      include: { participants: { select: { userId: true } } },
      orderBy: { startsAt: "asc" },
      take: 1000,
    });
  });
  app.post("/api/v1/events", async (request, reply) => {
    const user = await requireUser(request);
    const { familyId, ...body } = fields.extend({ familyId: z.string().uuid() }).parse(request.body);
    const member = await membership(user.id, familyId, true);
    const { participantIds, startsAt: local, ...data } = body;
    for (const id of participantIds) await membership(id, familyId);
    const startsAt = localInstant(body.allDay ? local.slice(0, 10) : local, member.family.timezone);
    const result = await db.$transaction(async (tx) => {
      const event = await tx.familyEvent.create({
        data: {
          ...data,
          familyId,
          startsAt,
          dateOnly: body.allDay ? local.slice(0, 10) : null,
          participants: { create: [...new Set(participantIds)].map((userId) => ({ userId })) },
        },
        include: { participants: true },
      });
      if (event.reminderMinutes !== null && event.status === "SCHEDULED")
        await scheduleNotification(
          tx,
          familyId,
          "events",
          event.id,
          "Você tem um compromisso da família",
          "Calendário/" + event.id,
          new Date(startsAt.getTime() - event.reminderMinutes * 60_000),
          event.updatedAt.toISOString(),
        );
      await audit(tx, user.id, familyId, "EVENT_CREATED", "FamilyEvent", event.id);
      return event;
    });
    return reply.code(201).send(result);
  });
  app.patch("/api/v1/events/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    const body = fields.partial().parse(request.body);
    const original = await db.familyEvent.findUnique({ where: { id } });
    if (!original) throw new HttpError(404, "Evento não encontrado");
    const member = await membership(user.id, original.familyId, true);
    const { participantIds, startsAt: local, ...data } = body;
    if (participantIds) for (const userId of participantIds) await membership(userId, original.familyId);
    const allDay = body.allDay ?? original.allDay;
    if (body.allDay !== undefined && body.allDay !== original.allDay && !local)
      throw new HttpError(400, "Informe a data ao alterar o tipo de evento");
    const startsAt = local
      ? localInstant(allDay ? local.slice(0, 10) : local, member.family.timezone)
      : original.startsAt!;
    return db.$transaction(async (tx) => {
      const event = await tx.familyEvent.update({
        where: { id },
        data: {
          ...data,
          startsAt,
          dateOnly: allDay ? (local?.slice(0, 10) ?? original.dateOnly) : null,
          ...(participantIds
            ? {
                participants: {
                  deleteMany: {},
                  create: [...new Set(participantIds)].map((userId) => ({ userId })),
                },
              }
            : {}),
        },
        include: { participants: true },
      });
      await tx.notification.deleteMany({ where: { familyId: event.familyId, route: "Calendário/" + id } });
      if (event.status === "SCHEDULED" && event.reminderMinutes !== null)
        await scheduleNotification(
          tx,
          event.familyId,
          "events",
          id,
          "Você tem um compromisso da família",
          "Calendário/" + id,
          new Date(startsAt.getTime() - event.reminderMinutes * 60_000),
          event.updatedAt.toISOString(),
        );
      await audit(tx, user.id, event.familyId, "EVENT_UPDATED", "FamilyEvent", id);
      return event;
    });
  });
}
