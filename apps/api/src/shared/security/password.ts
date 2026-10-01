import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export async function hashSecret(value: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(value, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}
export async function verifySecret(value: string, stored: string) {
  const [salt, encoded] = stored.split(":");
  if (!salt || !encoded) return false;
  const derived = (await scrypt(value, salt, 64)) as Buffer;
  const expected = Buffer.from(encoded, "hex");
  return expected.length === derived.length && timingSafeEqual(derived, expected);
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
