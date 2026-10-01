import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import { dayBounds, familyQuery, membership } from "../../shared/domain.js";
export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/analytics/summary", async (request) => {
    const user = await requireUser(request);
    const { familyId } = familyQuery.parse(request.query);
    await membership(user.id, familyId);
    const [openTasks, completedTasks, activeLists, pendingItems, scheduledEvents] = await Promise.all([
      db.task.count({ where: { familyId, status: "OPEN" } }),
      db.task.count({
        where: { familyId, status: "DONE", updatedAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
      }),
      db.shoppingList.count({ where: { familyId, status: "ACTIVE" } }),
      db.shoppingItem.count({ where: { checked: false, list: { familyId, status: "ACTIVE" } } }),
      db.familyEvent.count({ where: { familyId, status: "SCHEDULED", startsAt: { gte: new Date() } } }),
    ]);
    return { periodDays: 30, openTasks, completedTasks, activeLists, pendingItems, scheduledEvents };
  });
  app.get("/api/v1/dashboard", async (request) => {
    const user = await requireUser(request);
    const { familyId } = familyQuery.parse(request.query);
    const { family } = await membership(user.id, familyId);
    const { start, end, date } = dayBounds(family.timezone);
    return db.$transaction(
      async (tx) => {
        const [tasks, todayCount, overdueCount, events, eventCount, lists] = await Promise.all([
          tx.task.findMany({
            where: { familyId, status: "OPEN", dueAt: { lt: end } },
            include: { assignee: { select: { id: true, name: true } } },
            orderBy: { dueAt: "asc" },
            take: 50,
          }),
          tx.task.count({ where: { familyId, status: "OPEN", dueAt: { gte: start, lt: end } } }),
          tx.task.count({ where: { familyId, status: "OPEN", dueAt: { lt: start } } }),
          tx.familyEvent.findMany({
            where: { familyId, status: "SCHEDULED", startsAt: { gte: start } },
            orderBy: { startsAt: "asc" },
            take: 10,
          }),
          tx.familyEvent.count({ where: { familyId, status: "SCHEDULED", startsAt: { gte: start } } }),
          tx.shoppingList.findMany({
            where: { familyId, status: "ACTIVE" },
            include: { _count: { select: { items: { where: { checked: false } } } } },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
        ]);
        return {
          timezone: family.timezone,
          date,
          todayCount,
          overdueCount,
          eventCount,
          shoppingCount: lists.reduce((sum, list) => sum + list._count.items, 0),
          tasks,
          events,
          lists,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  });
}
