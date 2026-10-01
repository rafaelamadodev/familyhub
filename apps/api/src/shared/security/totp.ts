import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of randomBytes(20)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function key() {
  const configured = process.env.MFA_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  if (!configured) throw new Error("Configure MFA_ENCRYPTION_KEY");
  return createHash("sha256").update(configured).digest();
}
export function encryptTotp(secret: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const value = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    value.toString("base64url"),
  ].join(".");
}
export function decryptTotp(payload: string) {
  const [nonce, tag, value] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(value, "base64url")), decipher.final()]).toString("utf8");
}
function base32(input: string) {
  let bits = 0,
    value = 0;
  const result: number[] = [];
  for (const char of input) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid TOTP secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}
export function totpCode(secret: string, now = Date.now()) {
  const counter = Math.floor(now / 30_000);
  return codeAtCounter(secret, counter);
}
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const current = Math.floor(now / 30_000);
  return [-1, 0, 1].some((delta) => {
    const expected = Buffer.from(codeAtCounter(secret, current + delta));
    const supplied = Buffer.from(code);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  });
}
function codeAtCounter(secret: string, counter: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary =
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}
