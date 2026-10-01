import "dotenv/config";
import nodemailer from "nodemailer";
import { applicationDefault, initializeApp, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { db } from "./db.js";
import { deleteFile } from "./modules/documents/storage.js";
import { Worker } from "bullmq";
import { dispatchOutbox, redis } from "./shared/queue.js";

const mail = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: process.env.SMTP_SECURE === "true",
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
    : {}),
  connectionTimeout: 5000,
  socketTimeout: 10000,
});
if (process.env.FCM_ENABLED === "true" && !getApps().length)
  initializeApp({ credential: applicationDefault() });
let busy = false;
async function sendPush(notificationId: string) {
  const notification = await db.notification.findUnique({
    where: { id: notificationId },
    include: { user: { include: { devices: true } } },
  });
  if (!notification || notification.deliveredAt) return;
  const active = await db.familyMember.findFirst({
    where: { familyId: notification.familyId, userId: notification.userId, status: "ACTIVE" },
    include: { family: true },
  });
  const prefs = notification.user.notificationPreferences as Record<string, boolean> | null;
  const familyPrefs = active?.family.notificationPreferences as Record<string, boolean> | null;
  if (
    !active ||
    prefs?.push === false ||
    prefs?.[notification.category] === false ||
    familyPrefs?.[notification.category] === false ||
    !notification.user.devices.length
  ) {
    await db.notification.update({ where: { id: notification.id }, data: { deliveredAt: new Date() } });
    return;
  }
  for (const device of notification.user.devices) {
    try {
      await getMessaging().send({
        token: device.token,
        notification: { title: "FamilyHub", body: notification.title },
        data: { notificationId: notification.id, familyId: notification.familyId, route: notification.route },
      });
    } catch (error) {
      if (
        ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(
          (error as { code: string }).code,
        )
      )
        await db.pushDevice.deleteMany({ where: { id: device.id } });
      else throw error;
    }
  }
  await db.notification.update({ where: { id: notification.id }, data: { deliveredAt: new Date() } });
}
const mailWorker = process.env.REDIS_URL
  ? new Worker(
      "familyhub-outbox",
      async (job) => {
        if (job.name === "push") {
          try {
            await sendPush(String(job.data.id));
          } catch (error) {
            if (job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1))
              await db.notification.updateMany({
                where: { id: String(job.data.id), deliveredAt: null },
                data: { attempts: { increment: 1 } },
              });
            throw error;
          }
          return;
        }
        if (job.name !== "mail") return;
        const record = await db.mailJob.findUnique({ where: { id: String(job.data.id) } });
        if (!record) return;
        try {
          await mail.sendMail({
            from: process.env.SMTP_FROM ?? "no-reply@familyhub.local",
            to: record.recipient,
            subject: record.subject,
            text: record.text,
          });
          await db.mailJob.delete({ where: { id: record.id } });
        } catch (error) {
          await db.mailJob.update({
            where: { id: record.id },
            data: { attempts: { increment: 1 }, availableAt: new Date(Date.now() + 15 * 60_000) },
          });
          throw error;
        }
      },
      { connection: redis!, concurrency: 5, autorun: true },
    )
  : null;
export async function runJobs() {
  if (busy) return;
  busy = true;
  try {
    // One local worker; durable PostgreSQL outbox survives API/provider restarts.
    const jobs = await db.mailJob.findMany({
      where: { availableAt: { lte: new Date() } },
      take: 20,
      orderBy: { createdAt: "asc" },
    });
    if (mailWorker) {
      const expired = jobs.filter((job) => Date.now() - job.createdAt.getTime() > 86400_000);
      if (expired.length)
        await db.mailJob.deleteMany({ where: { id: { in: expired.map((job) => job.id) } } });
      await dispatchOutbox(
        jobs
          .filter((job) => Date.now() - job.createdAt.getTime() <= 86400_000)
          .map((job) => ({ kind: "mail" as const, id: job.id, attempts: job.attempts })),
      );
      if (process.env.FCM_ENABLED === "true") {
        const notifications = await db.notification.findMany({
          where: { deliveredAt: null, scheduledAt: { lte: new Date() }, attempts: { lt: 5 } },
          take: 30,
          orderBy: { scheduledAt: "asc" },
        });
        await dispatchOutbox(
          notifications.map((item) => ({ kind: "push" as const, id: item.id, attempts: item.attempts })),
        );
      }
    } else
      for (const job of jobs) {
        if (Date.now() - job.createdAt.getTime() > 86400_000) {
          await db.mailJob.delete({ where: { id: job.id } });
          continue;
        }
        try {
          await mail.sendMail({
            from: process.env.SMTP_FROM ?? "no-reply@familyhub.local",
            to: job.recipient,
            subject: job.subject,
            text: job.text,
          });
          await db.mailJob.delete({ where: { id: job.id } });
        } catch {
          await db.mailJob.update({
            where: { id: job.id },
            data: {
              attempts: { increment: 1 },
              availableAt: new Date(Date.now() + Math.min(3600_000, 15000 * 2 ** Math.min(job.attempts, 8))),
            },
          });
        }
      }
    if (process.env.FCM_ENABLED === "true" && !mailWorker) {
      const notifications = await db.notification.findMany({
        where: { deliveredAt: null, scheduledAt: { lte: new Date() }, attempts: { lt: 5 } },
        include: { user: { include: { devices: true } } },
        take: 30,
      });
      for (const notification of notifications) {
        const active = await db.familyMember.findFirst({
          where: { familyId: notification.familyId, userId: notification.userId, status: "ACTIVE" },
          include: { family: true },
        });
        const prefs = notification.user.notificationPreferences as Record<string, boolean> | null;
        const familyPrefs = active?.family.notificationPreferences as Record<string, boolean> | null;
        if (
          !active ||
          prefs?.push === false ||
          prefs?.[notification.category] === false ||
          familyPrefs?.[notification.category] === false ||
          !notification.user.devices.length
        ) {
          await sendPush(notification.id);
          continue;
        }
        try {
          for (const device of notification.user.devices) {
            try {
              await getMessaging().send({
                token: device.token,
                notification: { title: "FamilyHub", body: notification.title },
                data: {
                  notificationId: notification.id,
                  familyId: notification.familyId,
                  route: notification.route,
                },
              });
            } catch (error) {
              if (
                [
                  "messaging/registration-token-not-registered",
                  "messaging/invalid-registration-token",
                ].includes((error as { code: string }).code)
              )
                await db.pushDevice.deleteMany({ where: { id: device.id } });
              else throw error;
            }
          }
          await db.notification.update({ where: { id: notification.id }, data: { deliveredAt: new Date() } });
        } catch {
          await db.notification.update({
            where: { id: notification.id },
            data: { attempts: { increment: 1 } },
          });
        }
      }
    }
    for (const job of await db.objectDeletionJob.findMany({ take: 20 })) {
      try {
        await deleteFile(job.objectKey);
        await db.objectDeletionJob.delete({ where: { id: job.id } });
      } catch {
        /* Retry later without logging object names or provider payloads. */
      }
    }
  } finally {
    busy = false;
  }
}
const timer = setInterval(() => {
  void runJobs().catch(() => console.error("Worker indisponível; nova tentativa em 15 segundos."));
}, 15_000);
void runJobs().catch(() => console.error("Worker aguardando banco de dados."));
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    clearInterval(timer);
    void Promise.all([mailWorker?.close(), redis?.quit(), db.$disconnect()]).finally(() => process.exit(0));
  });
