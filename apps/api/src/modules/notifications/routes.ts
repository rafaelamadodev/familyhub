import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import { HttpError, idParams, preferencesSchema } from "../../shared/domain.js";
export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications", async (request) => {
    const user = await requireUser(request);
    const members = await db.familyMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { familyId: true },
    });
    return db.notification.findMany({
      where: {
        userId: user.id,
        familyId: { in: members.map((item) => item.familyId) },
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    });
  });
  app.patch("/api/v1/notifications/:id/read", async (request) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    const result = await db.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new HttpError(404, "Notificação não encontrada");
    return { message: "Notificação lida" };
  });
  app.get("/api/v1/notification-preferences", async (request) => {
    const user = await requireUser(request);
    return user.notificationPreferences ?? { tasks: true, events: true, shopping: true, push: true };
  });
  app.put("/api/v1/notification-preferences", async (request) => {
    const user = await requireUser(request);
    const body = preferencesSchema.parse(request.body);
    await db.user.update({ where: { id: user.id }, data: { notificationPreferences: body } });
    return body;
  });
  app.post("/api/v1/push-devices", async (request) => {
    const user = await requireUser(request);
    const body = z.object({ token: z.string().min(20).max(4096) }).parse(request.body);
    await db.pushDevice.upsert({
      where: { token: body.token },
      create: { userId: user.id, token: body.token },
      update: { userId: user.id },
    });
    return { message: "Dispositivo registrado" };
  });
  app.delete("/api/v1/push-devices", async (request) => {
    const user = await requireUser(request);
    const body = z.object({ token: z.string().max(4096) }).parse(request.body);
    await db.pushDevice.deleteMany({ where: { token: body.token, userId: user.id } });
    return { message: "Dispositivo removido" };
  });
}
