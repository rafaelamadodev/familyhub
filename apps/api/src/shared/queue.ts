import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : null;
export const outboxQueue = redis ? new Queue("familyhub-outbox", { connection: redis }) : null;

export async function dispatchOutbox(jobs: Array<{ kind: "mail" | "push"; id: string; attempts: number }>) {
  if (!outboxQueue) return;
  await Promise.all(
    jobs.map(({ kind, id, attempts }) =>
      outboxQueue.add(
        kind,
        { id },
        {
          jobId: kind + "-" + id + "-try-" + attempts,
          attempts: 5,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      ),
    ),
  );
}
