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
    if (process.env.REDIS_URL) {
      try {
        const redisKey = "familyhub:rate:" + key;
        const count = await redis!.incr(redisKey);
        if (count === 1) await redis!.pexpire(redisKey, 15 * 60_000);
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
