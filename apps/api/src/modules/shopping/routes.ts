import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import { familyQuery, HttpError, idParams, membership, prioritySchema } from "../../shared/domain.js";
import { shoppingListPdf } from "../../shared/pdf.js";
const listSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  })
  .strict();
const itemSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    quantity: z.number().positive().max(999999).nullable().optional(),
    unit: z.string().max(32).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    priority: prioritySchema.default("NORMAL"),
    checked: z.boolean().default(false),
  })
  .strict();
const sortedItems = {
  orderBy: [{ checked: "asc" as const }, { priority: "desc" as const }, { createdAt: "asc" as const }],
};
export async function registerShoppingRoutes(app: FastifyInstance) {
  app.get("/api/v1/shopping-lists", async (request) => {
    const user = await requireUser(request);
    const { familyId } = familyQuery.parse(request.query);
    await membership(user.id, familyId);
    return db.shoppingList.findMany({
      where: { familyId },
      include: { items: sortedItems },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
  app.post("/api/v1/shopping-lists", async (request, reply) => {
    const user = await requireUser(request);
    const body = listSchema.extend({ familyId: z.string().uuid() }).parse(request.body);
    await membership(user.id, body.familyId, true);
    return reply.code(201).send(await db.shoppingList.create({ data: body, include: { items: true } }));
  });
  app.patch("/api/v1/shopping-lists/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    const body = listSchema.partial().parse(request.body);
    const list = await db.shoppingList.findUnique({ where: { id } });
    if (!list) throw new HttpError(404, "Lista não encontrada");
    await membership(user.id, list.familyId, true);
    return db.shoppingList.update({ where: { id }, data: body, include: { items: sortedItems } });
  });
  app.get("/api/v1/shopping-lists/:id/pdf", async (request, reply) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    const includePurchased = z.coerce.boolean().default(false).parse((request.query as { includePurchased?: string }).includePurchased);
    const list = await db.shoppingList.findUnique({
      where: { id },
      include: { family: { select: { name: true } }, items: { orderBy: [{ checked: "asc" }, { priority: "desc" }, { createdAt: "asc" }] } },
    });
    if (!list) throw new HttpError(404, "Lista não encontrada");
    await membership(user.id, list.familyId);
    const items = list.items.filter((item) => includePurchased || !item.checked);
    const priorityLabel = { HIGH: "Alta", NORMAL: "Normal", LOW: "Baixa" } as const;
    const lines = items.length
      ? items.map((item) => `□ ${item.name}${item.quantity ? ` — ${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : ""} · ${priorityLabel[item.priority]}${item.note ? ` · ${item.note}` : ""}`)
      : [includePurchased ? "Nenhum item na lista." : "Nenhum item pendente."];
    const pdf = shoppingListPdf(`Lista de compras: ${list.name}`, list.family.name, lines);
    return reply.type("application/pdf").header("Content-Disposition", `attachment; filename="lista-${list.id}.pdf"`).send(pdf);
  });
  app.post("/api/v1/shopping-items", async (request, reply) => {
    const user = await requireUser(request);
    const body = itemSchema.extend({ listId: z.string().uuid() }).parse(request.body);
    const list = await db.shoppingList.findUnique({ where: { id: body.listId } });
    if (!list) throw new HttpError(404, "Lista não encontrada");
    await membership(user.id, list.familyId, true);
    if (list.status === "ARCHIVED") throw new HttpError(409, "Reative a lista para adicionar itens");
    return reply.code(201).send(await db.shoppingItem.create({ data: body }));
  });
  app.patch("/api/v1/shopping-items/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    const body = itemSchema.partial().parse(request.body);
    const item = await db.shoppingItem.findUnique({ where: { id }, include: { list: true } });
    if (!item) throw new HttpError(404, "Item não encontrado");
    await membership(user.id, item.list.familyId, true);
    return db.shoppingItem.update({ where: { id }, data: body });
  });
  app.delete("/api/v1/shopping-items/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    const item = await db.shoppingItem.findUnique({ where: { id }, include: { list: true } });
    if (!item) throw new HttpError(404, "Item não encontrado");
    await membership(user.id, item.list.familyId, true);
    await db.shoppingItem.delete({ where: { id } });
    return { message: "Item removido" };
  });
}
