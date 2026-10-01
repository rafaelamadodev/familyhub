import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import {
  administrator,
  audit,
  familyQuery,
  HttpError,
  idParams,
  membership,
  verified,
} from "../../shared/domain.js";
const fields = z
  .object({
    name: z.string().trim().min(1).max(120),
    birthDate: z.string().date().nullable().optional(),
    relationship: z.string().max(80).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    blockedModules: z
      .array(z.enum(["health", "documents"]))
      .max(2)
      .default([]),
  })
  .strict();
export async function registerChildrenRoutes(app: FastifyInstance) {
  app.get("/api/v1/children", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId } = familyQuery.parse(request.query);
    await membership(user.id, familyId, false, "children");
    return db.$transaction(async (tx) => {
      await audit(tx, user.id, familyId, "CHILDREN_READ", "ChildProfile");
      return tx.childProfile.findMany({ where: { familyId }, orderBy: { name: "asc" }, take: 100 });
    });
  });
  app.post("/api/v1/children", async (request, reply) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, ...body } = fields.extend({ familyId: z.string().uuid() }).parse(request.body);
    await membership(user.id, familyId, true, "children");
    if (body.blockedModules.length) await administrator(user.id, familyId);
    if (body.birthDate && body.birthDate > new Date().toISOString().slice(0, 10))
      throw new HttpError(400, "Nascimento não pode estar no futuro");
    const result = await db.$transaction(async (tx) => {
      const child = await tx.childProfile.create({
        data: {
          ...body,
          birthDate: body.birthDate ? new Date(body.birthDate + "T00:00:00Z") : null,
          familyId,
          createdById: user.id,
        },
      });
      await audit(tx, user.id, familyId, "CHILD_CREATED", "ChildProfile", child.id);
      return child;
    });
    return reply.code(201).send(result);
  });
  app.patch("/api/v1/children/:id", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { id } = idParams.parse(request.params);
    const body = fields.partial().parse(request.body);
    const child = await db.childProfile.findUnique({ where: { id } });
    if (!child) throw new HttpError(404, "Perfil não encontrado");
    await membership(user.id, child.familyId, true, "children");
    if (body.blockedModules) await administrator(user.id, child.familyId);
    if (body.birthDate && body.birthDate > new Date().toISOString().slice(0, 10))
      throw new HttpError(400, "Nascimento não pode estar no futuro");
    return db.$transaction(async (tx) => {
      const updated = await tx.childProfile.update({
        where: { id },
        data: {
          ...body,
          birthDate:
            body.birthDate === undefined
              ? undefined
              : body.birthDate
                ? new Date(body.birthDate + "T00:00:00Z")
                : null,
        },
      });
      await audit(tx, user.id, child.familyId, "CHILD_UPDATED", "ChildProfile", id);
      return updated;
    });
  });
}
