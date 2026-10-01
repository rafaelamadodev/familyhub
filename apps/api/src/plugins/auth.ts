import type { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import { db } from "../db.js";
import { HttpError } from "../shared/domain.js";
export async function registerAuthPlugin(app: FastifyInstance) {
  if (!process.env.JWT_SECRET) throw new Error("Configure JWT_SECRET");
  await app.register(jwt, { secret: process.env.JWT_SECRET, sign: { expiresIn: "15m" } });
}
export async function requireUser(request: FastifyRequest) {
  const cookieAuth = !request.headers.authorization && Boolean(request.cookies?.familyhub_access);
  if (cookieAuth && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const supplied = request.headers["x-csrf-token"];
    if (typeof supplied !== "string" || supplied !== request.cookies?.familyhub_csrf)
      throw new HttpError(403, "Validação CSRF inválida");
  }
  try {
    await request.jwtVerify();
  } catch {
    const token = request.cookies?.familyhub_access;
    if (!token) throw new HttpError(401, "Sessão expirada. Entre novamente.");
    try {
      request.user = await request.server.jwt.verify(token);
    } catch {
      throw new HttpError(401, "Sessão expirada. Entre novamente.");
    }
  }
  if (!request.user.sid) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  const session = await db.session.findFirst({
    where: { id: request.user.sid, userId: request.user.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!session) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  return session.user;
}
export function publicUser(user: {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  emailVerifiedAt?: Date | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    photoUrl: user.photoUrl,
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}
