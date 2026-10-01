import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import {
  audit,
  childAccess,
  familyQuery,
  HttpError,
  idParams,
  localInstant,
  membership,
  verified,
} from "../../shared/domain.js";
const fields = z
  .object({
    childId: z.string().uuid().nullable().optional(),
    category: z.enum(["VACCINE", "APPOINTMENT", "MEDICATION", "NOTE"]),
    title: z.string().trim().min(1).max(180),
    recordDate: z.string().max(40).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    professional: z.string().max(120).nullable().optional(),
    specialty: z.string().max(120).nullable().optional(),
    completed: z.boolean().optional(),
  })
  .strict();
export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/v1/health-records", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, childId } = familyQuery
      .extend({ childId: z.string().uuid().optional() })
      .parse(request.query);
    const member = await membership(user.id, familyId, false, "health");
    await childAccess(user.id, familyId, childId, "health");
    const canChildren = member.role === "ADMIN" || member.sensitivePermissions.includes("children");
    return db.$transaction(async (tx) => {
      await audit(tx, user.id, familyId, "HEALTH_READ", "HealthRecord");
      return tx.healthRecord.findMany({
        where: {
          familyId,
          ...(childId
            ? { childId }
            : canChildren
              ? {
                  OR: [
                    { childId: null },
                    { child: { blockedModules: { isEmpty: true } } },
                    { child: { NOT: { blockedModules: { has: "health" } } } },
                  ],
                }
              : { childId: null }),
        },
        orderBy: { recordDate: "desc" },
        take: 500,
      });
    });
  });
  app.post("/api/v1/health-records", async (request, reply) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, completed, recordDate, ...body } = fields
      .extend({ familyId: z.string().uuid() })
      .parse(request.body);
    const member = await membership(user.id, familyId, true, "health");
    await childAccess(user.id, familyId, body.childId, "health");
    const result = await db.$transaction(async (tx) => {
      const record = await tx.healthRecord.create({
        data: {
          ...body,
          familyId,
          recordDate: recordDate ? localInstant(recordDate, member.family.timezone) : null,
          completedAt: completed ? new Date() : null,
        },
      });
      await audit(tx, user.id, familyId, "HEALTH_CREATED", "HealthRecord", record.id);
      return record;
    });
    return reply.code(201).send(result);
  });
  app.patch("/api/v1/health-records/:id", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { id } = idParams.parse(request.params);
    const { completed, recordDate, ...body } = fields.partial().parse(request.body);
    const original = await db.healthRecord.findUnique({ where: { id } });
    if (!original) throw new HttpError(404, "Registro não encontrado");
    const member = await membership(user.id, original.familyId, true, "health");
    await childAccess(user.id, original.familyId, original.childId, "health");
    if (body.childId) await childAccess(user.id, original.familyId, body.childId, "health");
    return db.$transaction(async (tx) => {
      const record = await tx.healthRecord.update({
        where: { id },
        data: {
          ...body,
          recordDate:
            recordDate === undefined
              ? undefined
              : recordDate
                ? localInstant(recordDate, member.family.timezone)
                : null,
          completedAt: completed === undefined ? undefined : completed ? new Date() : null,
        },
      });
      await audit(
        tx,
        user.id,
        original.familyId,
        completed ? "DOSE_COMPLETED" : "HEALTH_UPDATED",
        "HealthRecord",
        id,
      );
      return record;
    });
  });
  app.delete("/api/v1/health-records/:id", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { id } = idParams.parse(request.params);
    const record = await db.healthRecord.findUnique({ where: { id } });
    if (!record) throw new HttpError(404, "Registro não encontrado");
    await membership(user.id, record.familyId, true, "health");
    await childAccess(user.id, record.familyId, record.childId, "health");
    await db.$transaction(async (tx) => {
      await tx.healthRecord.delete({ where: { id } });
      await audit(tx, user.id, record.familyId, "HEALTH_DELETED", "HealthRecord", id);
    });
    return { message: "Registro excluído" };
  });
}
