import type { Prisma } from "../../../generated/prisma/index.js";
export async function scheduleNotification(
  tx: Prisma.TransactionClient,
  familyId: string,
  category: string,
  entityId: string,
  title: string,
  route: string,
  scheduledAt: Date,
  version: string,
) {
  const members = await tx.familyMember.findMany({
    where: { familyId, status: "ACTIVE" },
    include: {
      user: { select: { notificationPreferences: true } },
      family: { select: { notificationPreferences: true } },
    },
  });
  await tx.notification.deleteMany({ where: { familyId, route, readAt: null } });
  for (const member of members) {
    const userPrefs = member.user.notificationPreferences as Record<string, boolean> | null;
    const familyPrefs = member.family.notificationPreferences as Record<string, boolean> | null;
    if (userPrefs?.[category] === false || familyPrefs?.[category] === false) continue;
    await tx.notification.upsert({
      where: { dedupKey: [member.userId, category, entityId, version].join(":") },
      update: {},
      create: {
        userId: member.userId,
        familyId,
        category,
        title,
        route,
        scheduledAt,
        dedupKey: [member.userId, category, entityId, version].join(":"),
      },
    });
  }
}
