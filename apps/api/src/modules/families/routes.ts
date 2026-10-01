import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import { imageSchema } from "../../shared/files.js";
import {
  administrator,
  audit,
  HttpError,
  idParams,
  membership,
  preferencesSchema,
  sensitiveModules,
  timezoneSchema,
  verified,
} from "../../shared/domain.js";
import { tokenHash } from "../../shared/security/password.js";
import { limit } from "../../shared/security/rate-limit.js";

const familySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    timezone: timezoneSchema.default("America/Sao_Paulo"),
    avatarUrl: imageSchema.optional(),
    notificationPreferences: preferencesSchema.optional(),
  })
  .strict();
const publicFamily = {
  id: true,
  name: true,
  timezone: true,
  avatarUrl: true,
  notificationPreferences: true,
} as const;
const params = z.object({ familyId: z.string().uuid() });
const memberParams = params.extend({ memberId: z.string().uuid() });
export async function registerFamilyRoutes(app: FastifyInstance) {
  app.get("/api/v1/families", async (request) => {
    const user = await requireUser(request);
    return db.familyMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { role: true, sensitivePermissions: true, family: { select: publicFamily } },
      orderBy: { createdAt: "asc" },
    });
  });
  app.post("/api/v1/families", async (request, reply) => {
    const user = await requireUser(request);
    await limit(request, "family-create", undefined, 10);
    const body = familySchema.parse(request.body);
    const family = await db.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: {
          ...body,
          joinCode: randomBytes(24).toString("hex"),
          members: { create: { userId: user.id, role: "ADMIN", joinedAt: new Date() } },
        },
        select: publicFamily,
      });
      await audit(tx, user.id, family.id, "FAMILY_CREATED", "Family", family.id);
      return family;
    });
    return reply.code(201).send(family);
  });
  app.patch("/api/v1/families/:familyId", async (request) => {
    const user = await requireUser(request);
    const { familyId } = params.parse(request.params);
    await administrator(user.id, familyId);
    const body = familySchema.partial().parse(request.body);
    return db.$transaction(async (tx) => {
      const family = await tx.family.update({ where: { id: familyId }, data: body, select: publicFamily });
      await audit(tx, user.id, familyId, "FAMILY_UPDATED", "Family", familyId);
      return family;
    });
  });
  app.get("/api/v1/families/:familyId/members", async (request) => {
    const user = await requireUser(request);
    const { familyId } = params.parse(request.params);
    await membership(user.id, familyId);
    return db.familyMember.findMany({
      where: { familyId, status: "ACTIVE" },
      select: {
        id: true,
        userId: true,
        role: true,
        sensitivePermissions: true,
        user: { select: { id: true, name: true, photoUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  });
  app.post("/api/v1/families/:familyId/invites", async (request, reply) => {
    const user = await requireUser(request);
    verified(user);
    await limit(request, "invite", undefined, 20);
    const { familyId } = params.parse(request.params);
    await administrator(user.id, familyId);
    const body = z
      .object({
        email: z.string().trim().toLowerCase().email().optional(),
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
      })
      .parse(request.body);
    const code = "FH-" + randomBytes(12).toString("hex").toUpperCase();
    const link = (process.env.APP_URL ?? "http://localhost:5173") + "/#invite=" + code;
    const invite = await db.$transaction(async (tx) => {
      const invite = await tx.familyInvite.create({
        data: {
          ...body,
          familyId,
          tokenHash: tokenHash(code),
          expiresAt: new Date(Date.now() + 7 * 86400_000),
        },
        select: { id: true, expiresAt: true, role: true, email: true },
      });
      if (body.email)
        await tx.mailJob.create({
          data: {
            recipient: body.email,
            subject: "Convite para o FamilyHub",
            text: "Aceite seu convite em até 7 dias: " + link,
          },
        });
      await audit(tx, user.id, familyId, "INVITE_CREATED", "FamilyInvite", invite.id);
      return invite;
    });
    return reply.code(201).send({ ...invite, code, link });
  });
  app.get("/api/v1/families/:familyId/invites", async (request) => {
    const user = await requireUser(request);
    const { familyId } = params.parse(request.params);
    await administrator(user.id, familyId);
    return db.familyInvite.findMany({
      where: { familyId },
      select: { id: true, email: true, role: true, expiresAt: true, usedAt: true, revokedAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
  app.delete("/api/v1/families/:familyId/invites/:id", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, id } = params.merge(idParams).parse(request.params);
    await administrator(user.id, familyId);
    await db.$transaction(async (tx) => {
      const result = await tx.familyInvite.updateMany({
        where: { id, familyId, usedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw new HttpError(404, "Convite não encontrado");
      await audit(tx, user.id, familyId, "INVITE_REVOKED", "FamilyInvite", id);
    });
    return { message: "Convite revogado" };
  });
  app.post("/api/v1/families/join", async (request, reply) => {
    const user = await requireUser(request);
    verified(user);
    await limit(request, "join", undefined, 10);
    const { joinCode } = z
      .object({
        joinCode: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^FH-[A-F0-9]{24}$/),
      })
      .parse(request.body);
    const family = await db.$transaction(async (tx) => {
      const invite = await tx.familyInvite.findUnique({ where: { tokenHash: tokenHash(joinCode) } });
      if (!invite || (invite.email && invite.email !== user.email))
        throw new HttpError(400, "Convite inválido ou indisponível");
      const existing = await tx.familyMember.findUnique({
        where: { familyId_userId: { familyId: invite.familyId, userId: user.id } },
      });
      if (existing?.status === "ACTIVE") throw new HttpError(409, "Você já participa desta família");
      const consumed = await tx.familyInvite.updateMany({
        where: { id: invite.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!consumed.count) throw new HttpError(400, "Convite inválido ou indisponível");
      await tx.familyMember.upsert({
        where: { familyId_userId: { familyId: invite.familyId, userId: user.id } },
        create: { familyId: invite.familyId, userId: user.id, role: invite.role, joinedAt: new Date() },
        update: { role: invite.role, status: "ACTIVE", joinedAt: new Date(), sensitivePermissions: [] },
      });
      await audit(tx, user.id, invite.familyId, "INVITE_ACCEPTED", "FamilyInvite", invite.id);
      return tx.family.findUniqueOrThrow({ where: { id: invite.familyId }, select: publicFamily });
    });
    return reply.code(201).send({ family });
  });
  app.patch("/api/v1/families/:familyId/members/:memberId", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, memberId } = memberParams.parse(request.params);
    await administrator(user.id, familyId);
    const body = z
      .object({
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional(),
        status: z.enum(["ACTIVE", "REVOKED"]).optional(),
        sensitivePermissions: z.array(z.enum(sensitiveModules)).max(4).optional(),
      })
      .strict()
      .parse(request.body);
    return db.$transaction(
      async (tx) => {
        const target = await tx.familyMember.findFirst({
          where: { id: memberId, familyId, status: "ACTIVE" },
        });
        if (!target) throw new HttpError(404, "Membro não encontrado");
        if (target.role === "ADMIN" && (body.status === "REVOKED" || (body.role && body.role !== "ADMIN"))) {
          const admins = await tx.familyMember.count({
            where: { familyId, role: "ADMIN", status: "ACTIVE" },
          });
          if (admins <= 1) throw new HttpError(409, "Mantenha pelo menos um administrador na família");
        }
        await tx.familyMember.update({ where: { id: memberId }, data: body });
        if (body.status === "REVOKED")
          await tx.notification.deleteMany({ where: { familyId, userId: target.userId } });
        await audit(tx, user.id, familyId, "MEMBER_UPDATED", "FamilyMember", memberId);
        return { message: "Membro atualizado" };
      },
      { isolationLevel: "Serializable" },
    );
  });
}
