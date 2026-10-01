import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser, publicUser } from "../../plugins/auth.js";
import { audit, HttpError, membership, verified } from "../../shared/domain.js";
import { verifySecret } from "../../shared/security/password.js";
const scopes = z
  .array(z.enum(["account", "routine", "children", "health", "documents", "finance"]))
  .min(1)
  .max(6);
const requestSchema = z
  .object({
    kind: z.enum(["EXPORT", "CORRECTION", "DELETE"]),
    password: z.string().max(128),
    familyId: z.string().uuid().optional(),
    scope: scopes,
    note: z.string().max(1000).optional(),
  })
  .strict();
export async function registerPrivacyRoutes(app: FastifyInstance) {
  app.get("/api/v1/privacy", async (request) => {
    const user = await requireUser(request);
    return {
      contact: process.env.PRIVACY_CONTACT ?? null,
      categories: [
        "Conta e sessões",
        "Rotina familiar",
        "Perfis de crianças",
        "Saúde",
        "Documentos privados",
        "Finanças",
      ],
      consentPreferences: user.consentPreferences ?? { optionalCommunications: false },
      requests: await db.privacyRequest.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          kind: true,
          scope: true,
          status: true,
          note: true,
          createdAt: true,
          updatedAt: true,
          reviewedAt: true,
          resolutionNote: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    };
  });
  app.put("/api/v1/privacy/consents", async (request) => {
    const user = await requireUser(request);
    const body = z.object({ optionalCommunications: z.boolean() }).strict().parse(request.body);
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { consentPreferences: { ...body, updatedAt: new Date().toISOString(), version: "1" } },
      });
      await audit(
        tx,
        user.id,
        null,
        body.optionalCommunications ? "CONSENT_GIVEN" : "CONSENT_REVOKED",
        "User",
        user.id,
      );
    });
    return body;
  });
  app.post("/api/v1/privacy/requests", async (request, reply) => {
    const user = await requireUser(request);
    verified(user);
    const body = requestSchema.parse(request.body);
    if (!(await verifySecret(body.password, user.passwordHash))) throw new HttpError(403, "Senha inválida");
    if (body.scope.some((scope) => scope !== "account") && !body.familyId)
      throw new HttpError(400, "Selecione uma família para os dados compartilhados");
    const member = body.familyId ? await membership(user.id, body.familyId) : null;
    for (const scope of body.scope)
      if (["children", "health", "documents", "finance"].includes(scope))
        await membership(user.id, body.familyId!, false, scope);
    const result = await db.$transaction(async (tx) => {
      const ticket = await tx.privacyRequest.create({
        data: {
          userId: user.id,
          kind: body.kind,
          scope: body.scope,
          note: body.note,
          status: body.kind === "EXPORT" ? "COMPLETED" : "REQUESTED",
          ...(body.kind === "EXPORT"
            ? { reviewedAt: new Date(), resolutionNote: "Exportação gerada e disponibilizada ao titular." }
            : {}),
        },
      });
      await audit(tx, user.id, body.familyId ?? null, "PRIVACY_" + body.kind, "PrivacyRequest", ticket.id);
      if (body.kind !== "EXPORT")
        return { request: ticket, message: "Solicitação registrada. Acompanhe o estado nesta tela." };
      const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), scope: body.scope };
      if (body.scope.includes("account"))
        data.account = {
          ...publicUser(user),
          createdAt: user.createdAt,
          notificationPreferences: user.notificationPreferences,
          consentPreferences: user.consentPreferences,
        };
      if (body.scope.includes("routine"))
        data.routine = {
          tasks: await tx.task.findMany({ where: { familyId: body.familyId } }),
          lists: await tx.shoppingList.findMany({
            where: { familyId: body.familyId },
            include: { items: true },
          }),
          events: await tx.familyEvent.findMany({ where: { familyId: body.familyId } }),
        };
      const canChildren = member?.role === "ADMIN" || member?.sensitivePermissions.includes("children");
      if (body.scope.includes("children"))
        data.children = await tx.childProfile.findMany({ where: { familyId: body.familyId } });
      if (body.scope.includes("health"))
        data.health = await tx.healthRecord.findMany({
          where: {
            familyId: body.familyId,
            ...(canChildren
              ? { OR: [{ childId: null }, { child: { NOT: { blockedModules: { has: "health" } } } }] }
              : { childId: null }),
          },
        });
      if (body.scope.includes("health"))
        data.growth = canChildren
          ? await tx.growthRecord.findMany({
              where: { familyId: body.familyId, child: { NOT: { blockedModules: { has: "health" } } } },
            })
          : [];
      if (body.scope.includes("documents"))
        data.documents = await tx.document.findMany({
          where: {
            familyId: body.familyId,
            ...(canChildren
              ? { OR: [{ childId: null }, { child: { NOT: { blockedModules: { has: "documents" } } } }] }
              : { childId: null }),
          },
          select: {
            id: true,
            name: true,
            category: true,
            holder: true,
            description: true,
            documentDate: true,
            mimeType: true,
            sizeBytes: true,
          },
        });
      if (body.scope.includes("finance"))
        data.finance = await tx.financialEntry.findMany({ where: { familyId: body.familyId } });
      return { request: ticket, data };
    });
    return reply.code(201).send(result);
  });
}
