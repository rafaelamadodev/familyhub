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
  membership,
  verified,
} from "../../shared/domain.js";
const fields = z
  .object({
    measuredOn: z.string().date(),
    weightKg: z.number().positive().max(500).nullable(),
    heightCm: z.number().positive().max(300).nullable(),
  })
  .refine((value) => value.weightKg !== null || value.heightCm !== null, "Informe peso ou altura");
export async function registerGrowthRoutes(app: FastifyInstance) {
  app.get("/api/v1/growth-records", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, childId } = familyQuery.extend({ childId: z.string().uuid() }).parse(request.query);
    await membership(user.id, familyId, false, "health");
    await childAccess(user.id, familyId, childId, "health");
    return db.$transaction(async (tx) => {
      await audit(tx, user.id, familyId, "GROWTH_READ", "GrowthRecord");
      return tx.growthRecord.findMany({
        where: { familyId, childId },
        orderBy: { measuredOn: "desc" },
        take: 500,
      });
    });
  });
  app.post("/api/v1/growth-records", async (request, reply) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, childId } = familyQuery.extend({ childId: z.string().uuid() }).parse(request.body);
    const body = fields.parse(request.body);
    await membership(user.id, familyId, true, "health");
    await childAccess(user.id, familyId, childId, "health");
    if (body.measuredOn > new Date().toISOString().slice(0, 10))
      throw new HttpError(400, "A medição não pode estar no futuro");
    const record = await db.$transaction(async (tx) => {
      const record = await tx.growthRecord.create({
        data: { ...body, familyId, childId, measuredOn: new Date(body.measuredOn) },
      });
      await audit(tx, user.id, familyId, "GROWTH_CREATED", "GrowthRecord", record.id);
      return record;
    });
    return reply.code(201).send(record);
  });
  app.delete("/api/v1/growth-records/:id", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { id } = idParams.parse(request.params);
    const record = await db.growthRecord.findUnique({ where: { id } });
    if (!record) throw new HttpError(404, "Medição não encontrada");
    await membership(user.id, record.familyId, true, "health");
    await childAccess(user.id, record.familyId, record.childId, "health");
    await db.$transaction(async (tx) => {
      await tx.growthRecord.delete({ where: { id } });
      await audit(tx, user.id, record.familyId, "GROWTH_DELETED", "GrowthRecord", id);
    });
    return { message: "Medição excluída" };
  });
}
