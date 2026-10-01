import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import {
  audit,
  dayBounds,
  familyQuery,
  HttpError,
  idParams,
  localInstant,
  membership,
  nextOccurrence,
  prioritySchema,
  recurrenceSchema,
} from "../../shared/domain.js";
import { scheduleNotification } from "../notifications/service.js";

const fields = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().max(2000).nullable().optional(),
    dueAt: z.string().max(40).nullable().optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    priority: prioritySchema.default("NORMAL"),
    recurrence: recurrenceSchema.optional(),
  })
  .strict();
const querySchema = familyQuery.extend({
  status: z.enum(["OPEN", "DONE", "ARCHIVED"]).optional(),
  assigneeId: z.string().uuid().optional(),
  deadline: z.enum(["today", "overdue", "upcoming"]).optional(),
});
const include = { assignee: { select: { id: true, name: true } } } as const;
export async function registerTaskRoutes(app: FastifyInstance) {
  app.get("/api/v1/tasks", async (request) => {
    const user = await requireUser(request);
    const query = querySchema.parse(request.query);
    const member = await membership(user.id, query.familyId);
    const { start, end } = dayBounds(member.family.timezone);
    return db.task.findMany({
      where: {
        familyId: query.familyId,
        status: query.status,
        assigneeId: query.assigneeId,
        ...(query.deadline
          ? {
              dueAt:
                query.deadline === "overdue"
                  ? { lt: start }
                  : query.deadline === "today"
                    ? { gte: start, lt: end }
                    : { gte: end },
            }
          : {}),
      },
      include,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
  });
  app.post("/api/v1/tasks", async (request, reply) => {
    const user = await requireUser(request);
    const { familyId, ...body } = fields.extend({ familyId: z.string().uuid() }).parse(request.body);
    const member = await membership(user.id, familyId, true);
    if (body.assigneeId) await membership(body.assigneeId, familyId);
    if (body.recurrence && !body.dueAt) throw new HttpError(400, "Tarefa recorrente precisa de vencimento");
    const dueAt = body.dueAt ? localInstant(body.dueAt, member.family.timezone) : null;
    const task = await db.$transaction(async (tx) => {
      const task = await tx.task.create({ data: { ...body, familyId, creatorId: user.id, dueAt }, include });
      await audit(tx, user.id, familyId, "TASK_CREATED", "Task", task.id);
      if (dueAt)
        await scheduleNotification(
          tx,
          familyId,
          "tasks",
          task.id,
          "Uma tarefa da família está pendente",
          "Tarefas/" + task.id,
          dueAt,
          task.updatedAt.toISOString(),
        );
      return task;
    });
    return reply.code(201).send(task);
  });
  app.patch("/api/v1/tasks/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    const body = fields
      .partial()
      .extend({ status: z.enum(["OPEN", "DONE", "ARCHIVED"]).optional() })
      .strict()
      .parse(request.body);
    const original = await db.task.findUnique({ where: { id } });
    if (!original) throw new HttpError(404, "Tarefa não encontrada");
    const member = await membership(user.id, original.familyId, true);
    if (body.assigneeId) await membership(body.assigneeId, original.familyId);
    const dueAt =
      body.dueAt === undefined
        ? original.dueAt
        : body.dueAt
          ? localInstant(body.dueAt, member.family.timezone)
          : null;
    const recurrence = body.recurrence === undefined ? original.recurrence : body.recurrence;
    if (recurrence && !dueAt) throw new HttpError(400, "Tarefa recorrente precisa de vencimento");
    return db.$transaction(async (tx) => {
      const changed = await tx.task.updateMany({
        where: { id, updatedAt: original.updatedAt },
        data: {
          ...body,
          dueAt,
          completedAt:
            body.status === "DONE"
              ? (original.completedAt ?? new Date())
              : body.status === "OPEN"
                ? null
                : original.completedAt,
        },
      });
      if (!changed.count) throw new HttpError(409, "A tarefa foi alterada. Atualize e tente novamente.");
      const task = await tx.task.findUniqueOrThrow({ where: { id }, include });
      if (task.status === "DONE" && original.status !== "DONE" && recurrence && dueAt) {
        const nextDate = nextOccurrence(dueAt, recurrence, member.family.timezone);
        const next = await tx.task.upsert({
          where: { occurrenceOf: id },
          update: {},
          create: {
            familyId: task.familyId,
            creatorId: task.creatorId,
            assigneeId: task.assigneeId,
            title: task.title,
            description: task.description,
            priority: task.priority,
            recurrence,
            occurrenceOf: id,
            dueAt: nextDate,
          },
        });
        if (next.dueAt)
          await scheduleNotification(
            tx,
            next.familyId,
            "tasks",
            next.id,
            "Uma tarefa da família está pendente",
            "Tarefas/" + next.id,
            next.dueAt,
            next.updatedAt.toISOString(),
          );
      }
      await tx.notification.deleteMany({ where: { familyId: task.familyId, route: "Tarefas/" + id } });
      if (task.status === "OPEN" && task.dueAt)
        await scheduleNotification(
          tx,
          task.familyId,
          "tasks",
          id,
          "Uma tarefa da família está pendente",
          "Tarefas/" + id,
          task.dueAt,
          task.updatedAt.toISOString(),
        );
      await audit(
        tx,
        user.id,
        task.familyId,
        body.status === "DONE"
          ? "TASK_COMPLETED"
          : body.assigneeId !== undefined
            ? "TASK_ASSIGNED"
            : "TASK_UPDATED",
        "Task",
        id,
      );
      return task;
    });
  });
  app.delete("/api/v1/tasks/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    const task = await db.task.findUnique({ where: { id } });
    if (!task) throw new HttpError(404, "Tarefa não encontrada");
    await membership(user.id, task.familyId, true);
    await db.$transaction(async (tx) => {
      await tx.task.delete({ where: { id } });
      await tx.notification.deleteMany({ where: { familyId: task.familyId, route: "Tarefas/" + id } });
      await audit(tx, user.id, task.familyId, "TASK_DELETED", "Task", id);
    });
    return { message: "Tarefa excluída" };
  });
  app.get("/api/v1/tasks/:id/history", async (request) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    const { familyId } = familyQuery.parse(request.query);
    await membership(user.id, familyId);
    const task = await db.task.findFirst({ where: { id, familyId }, select: { id: true } });
    if (!task) throw new HttpError(404, "Tarefa não encontrada");
    return db.auditLog.findMany({
      where: { familyId, entity: "Task", entityId: id },
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
}
