import { db } from "./db.js";
import { deleteFile } from "./modules/documents/storage.js";

let running: Promise<void> | null = null;

export function runMaintenance() {
  if (!running) running = processMaintenance().finally(() => (running = null));
  return running;
}

async function processMaintenance() {
  const jobs = await db.objectDeletionJob.findMany({ take: 20, orderBy: { createdAt: "asc" } });
  for (const job of jobs) {
    try {
      await deleteFile(job.objectKey);
      await db.objectDeletionJob.delete({ where: { id: job.id } });
    } catch {
      // Keep the job for the next cron invocation.
    }
  }
}
