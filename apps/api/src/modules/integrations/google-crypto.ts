import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
  const configured = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!configured || configured.length < 32)
    throw new Error("INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters");
  return createHash("sha256").update(configured).digest();
}

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted integration token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export const hashOAuthState = (state: string) => createHash("sha256").update(state).digest("hex");
