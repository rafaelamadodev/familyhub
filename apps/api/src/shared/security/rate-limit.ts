import type { FastifyRequest } from "fastify";
import { HttpError } from "../domain.js";
import { tokenHash } from "./password.js";
import { redis } from "../queue.js";

const attempts = new Map<string, { count: number; until: number }>();
export async function limit(request: FastifyRequest, action: string, email?: string, maximum = 10) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const keys = [
    action + ":ip:" + request.ip,
    ...(email ? [action + ":email:" + tokenHash(email.toLowerCase())] : []),
  ];
  for (const key of keys) {
    if (redis?.status === "ready") {
      try {
        const redisKey = "familyhub:rate:" + key;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const count = await Promise.race([
          (async () => {
            const current = await redis.incr(redisKey);
            if (current === 1) await redis.pexpire(redisKey, 15 * 60_000);
            return current;
          })(),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error("Redis rate-limit timeout")), 500);
          }),
        ]).finally(() => {
          if (timeout) clearTimeout(timeout);
        });
        if (count > maximum)
          throw new HttpError(429, "Muitas tentativas. Aguarde 15 minutos e tente novamente.");
        continue;
      } catch (error) {
        if (error instanceof HttpError) throw error;
        // Fall back to per-process limiting when Redis is temporarily unavailable.
      }
    }
    const attempt = attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
    attempt.count++;
    attempts.set(key, attempt);
    if (attempt.count > maximum)
      throw new HttpError(429, "Muitas tentativas. Aguarde 15 minutos e tente novamente.");
  }
}
