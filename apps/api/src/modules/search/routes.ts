import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import { familyQuery, membership } from "../../shared/domain.js";

export async function registerSearchRoutes(app: FastifyInstance) {
  app.get("/api/v1/search", async (request) => {
    const user = await requireUser(request);
    const { familyId, q } = familyQuery.extend({ q: z.string().trim().min(2).max(80) }).parse(request.query);
    await membership(user.id, familyId);
    const contains = { contains: q, mode: "insensitive" as const };
    const [tasks, events, lists] = await Promise.all([
      db.task.findMany({
        where: {
          familyId,
          status: { not: "ARCHIVED" },
          OR: [{ title: contains }, { description: contains }],
        },
        select: { id: true, title: true, dueAt: true, status: true },
        take: 20,
      }),
      db.familyEvent.findMany({
        where: {
          familyId,
          status: "SCHEDULED",
          OR: [{ title: contains }, { description: contains }, { location: contains }],
        },
        select: { id: true, title: true, startsAt: true, status: true },
        take: 20,
      }),
      db.shoppingList.findMany({
        where: {
          familyId,
          status: "ACTIVE",
          OR: [{ name: contains }, { items: { some: { name: contains } } }],
        },
        select: { id: true, name: true, status: true },
        take: 20,
      }),
    ]);
    return {
      results: [
        ...tasks.map((item) => ({
          type: "task",
          id: item.id,
          title: item.title,
          subtitle: item.dueAt?.toISOString() ?? "",
          route: "Tarefas",
        })),
        ...events.map((item) => ({
          type: "event",
          id: item.id,
          title: item.title,
          subtitle: item.startsAt?.toISOString() ?? "",
          route: "Calendário",
        })),
        ...lists.map((item) => ({
          type: "shopping",
          id: item.id,
          title: item.name,
          subtitle: "",
          route: "Compras",
        })),
      ].slice(0, 50),
    };
  });
}
