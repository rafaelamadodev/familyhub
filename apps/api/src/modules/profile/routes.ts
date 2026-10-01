import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db.js";
import { requireUser, publicUser } from "../../plugins/auth.js";
import { hashSecret, verifySecret } from "../../shared/security/password.js";
import { audit, HttpError } from "../../shared/domain.js";
import { verificationMail } from "../auth/routes.js";
import { imageSchema } from "../../shared/files.js";

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/v1/me", async (request) => ({ user: publicUser(await requireUser(request)) }));
  app.patch("/api/v1/me", async (request) => {
    const user = await requireUser(request);
    const body = z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email(),
        photoUrl: imageSchema.optional(),
        currentPassword: z.string().max(128).optional(),
      })
      .strict()
      .parse(request.body);
    if (body.email !== user.email && !(await verifySecret(body.currentPassword ?? "", user.passwordHash)))
      throw new HttpError(403, "Confirme sua senha para alterar o e-mail");
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: user.id },
        data: {
          name: body.name,
          email: body.email,
          photoUrl: body.photoUrl,
          ...(body.email !== user.email ? { emailVerifiedAt: null } : {}),
        },
      });
      if (body.email !== user.email) await verificationMail(tx, result);
      await audit(tx, user.id, null, "PROFILE_UPDATED", "User", user.id);
      return result;
    });
    return { user: publicUser(updated) };
  });
  app.patch("/api/v1/me/password", async (request) => {
    const user = await requireUser(request);
    const body = z
      .object({ currentPassword: z.string().max(128), newPassword: z.string().min(8).max(128) })
      .parse(request.body);
    if (!(await verifySecret(body.currentPassword, user.passwordHash)))
      throw new HttpError(403, "Senha atual inválida");
    const passwordHash = await hashSecret(body.newPassword);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
      await audit(tx, user.id, null, "PASSWORD_CHANGED", "User", user.id);
    });
    return { message: "Senha atualizada. Faça login novamente." };
  });
}
