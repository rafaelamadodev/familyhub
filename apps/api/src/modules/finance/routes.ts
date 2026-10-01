import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import {
  audit,
  familyQuery,
  HttpError,
  idParams,
  membership,
  nextOccurrence,
  verified,
} from "../../shared/domain.js";
const fields = z
  .object({
    description: z.string().trim().min(1).max(180),
    amount: z.number().positive().max(999999999).multipleOf(0.01),
    category: z.string().trim().min(1).max(80),
    competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    status: z.enum(["PLANNED", "PAID", "CANCELLED"]).default("PLANNED"),
    recurrence: z.enum(["MONTHLY"]).nullable().optional(),
  })
  .strict();
const monthDate = (value: string) => new Date(value + "-01T00:00:00Z");
export async function registerFinanceRoutes(app: FastifyInstance) {
  app.get("/api/v1/finance", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, month } = familyQuery
      .extend({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
      .parse(request.query);
    await membership(user.id, familyId, false, "finance");
    return db.$transaction(async (tx) => {
      await audit(tx, user.id, familyId, "FINANCE_READ", "FinancialEntry");
      const entries = await tx.financialEntry.findMany({
        where: { familyId, competence: monthDate(month) },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return {
        entries,
        total:
          entries
            .filter((item) => item.status !== "CANCELLED")
            .reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) / 100,
      };
    });
  });
  app.post("/api/v1/finance", async (request, reply) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, competence, ...body } = fields
      .extend({ familyId: z.string().uuid() })
      .parse(request.body);
    await membership(user.id, familyId, true, "finance");
    const result = await db.$transaction(async (tx) => {
      const entry = await tx.financialEntry.create({
        data: { ...body, familyId, competence: monthDate(competence) },
      });
      if (entry.status === "PAID" && entry.recurrence === "MONTHLY")
        await tx.financialEntry.create({
          data: {
            familyId,
            description: entry.description,
            amount: entry.amount,
            category: entry.category,
            recurrence: entry.recurrence,
            occurrenceOf: entry.id,
            competence: nextOccurrence(entry.competence, "MONTHLY", "UTC"),
          },
        });
      await audit(tx, user.id, familyId, "FINANCE_CREATED", "FinancialEntry", entry.id);
      return entry;
    });
    return reply.code(201).send(result);
  });
  app.patch("/api/v1/finance/:id", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { id } = idParams.parse(request.params);
    const { competence, ...body } = fields.partial().parse(request.body);
    const original = await db.financialEntry.findUnique({ where: { id } });
    if (!original) throw new HttpError(404, "Conta não encontrada");
    await membership(user.id, original.familyId, true, "finance");
    return db.$transaction(async (tx) => {
      const count = await tx.financialEntry.updateMany({
        where: { id, updatedAt: original.updatedAt },
        data: { ...body, competence: competence ? monthDate(competence) : undefined },
      });
      if (!count.count) throw new HttpError(409, "A conta foi alterada. Atualize a tela.");
      const entry = await tx.financialEntry.findUniqueOrThrow({ where: { id } });
      if (entry.status === "PAID" && entry.recurrence === "MONTHLY")
        await tx.financialEntry.upsert({
          where: { occurrenceOf: id },
          update: {},
          create: {
            familyId: entry.familyId,
            description: entry.description,
            amount: entry.amount,
            category: entry.category,
            recurrence: entry.recurrence,
            occurrenceOf: id,
            competence: nextOccurrence(entry.competence, "MONTHLY", "UTC"),
          },
        });
      await audit(tx, user.id, original.familyId, "FINANCE_UPDATED", "FinancialEntry", id);
      return entry;
    });
  });
  app.delete("/api/v1/finance/:id", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { id } = idParams.parse(request.params);
    const entry = await db.financialEntry.findUnique({ where: { id } });
    if (!entry) throw new HttpError(404, "Conta não encontrada");
    await membership(user.id, entry.familyId, true, "finance");
    await db.$transaction(async (tx) => {
      await tx.financialEntry.delete({ where: { id } });
      await audit(tx, user.id, entry.familyId, "FINANCE_DELETED", "FinancialEntry", id);
    });
    return { message: "Conta excluída" };
  });
  app.post("/api/v1/finance/export", async (request, reply) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, password, format } = familyQuery
      .extend({ password: z.string().max(128), format: z.enum(["json", "csv"]) })
      .parse(request.body);
    const { verifySecret } = await import("../../shared/security/password.js");
    if (!(await verifySecret(password, user.passwordHash))) throw new HttpError(403, "Senha inválida");
    await membership(user.id, familyId, false, "finance");
    const records = await db.$transaction(async (tx) => {
      await audit(tx, user.id, familyId, "FINANCE_EXPORTED", "FinancialEntry");
      return tx.financialEntry.findMany({ where: { familyId } });
    });
    if (format === "json") return records;
    const escape = (value: unknown) =>
      '"' +
      String(value)
        .replace(/^[=+@-]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    return reply
      .type("text/csv; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="financeiro.csv"')
      .send(
        [
          "descricao,valor,categoria,competencia,status",
          ...records.map((row) =>
            [row.description, row.amount, row.category, row.competence.toISOString().slice(0, 7), row.status]
              .map(escape)
              .join(","),
          ),
        ].join("\r\n"),
      );
  });
}
