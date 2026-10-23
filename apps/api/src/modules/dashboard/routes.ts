import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import { audit, dayBounds, familyQuery, membership } from "../../shared/domain.js";
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
    const member = await membership(user.id, familyId);
    const { family } = member;
    const { start, end, date } = dayBounds(family.timezone);
    const canViewFinance = member.role === "ADMIN" || member.sensitivePermissions.includes("finance");
    return db.$transaction(
      async (tx) => {
        if (canViewFinance) await audit(tx, user.id, familyId, "FINANCE_SUMMARY_READ", "FinancialEntry");
        const [tasks, todayCount, overdueCount, events, eventCount, lists, finance] = await Promise.all([
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
          canViewFinance
            ? tx.financialEntry.aggregate({
                where: {
                  familyId,
                  competence: new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`),
                  status: { not: "CANCELLED" },
                },
                _sum: { amount: true },
              })
            : Promise.resolve(null),
        ]);
        return {
          timezone: family.timezone,
          date,
          todayCount,
          overdueCount,
          eventCount,
          shoppingCount: lists.reduce((sum, list) => sum + list._count.items, 0),
          financeTotal: finance ? Number(finance._sum.amount ?? 0) : null,
          tasks,
          events,
          lists,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  });
}
