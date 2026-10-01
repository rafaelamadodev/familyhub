import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import {
  audit,
  childAccess,
  familyQuery,
  HttpError,
  idParams,
  membership,
  verified,
} from "../../shared/domain.js";
import { storeFile, fileUrl } from "./storage.js";
const upload = z.object({
  filename: z.string().max(180),
  mime: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  base64: z.string().max(14_000_000),
});
const fields = z
  .object({
    name: z.string().trim().min(1).max(180),
    category: z.string().trim().min(1).max(80),
    holder: z.string().max(120).nullable().optional(),
    childId: z.string().uuid().nullable().optional(),
    documentDate: z.string().date().nullable().optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict();
const select = {
  id: true,
  familyId: true,
  childId: true,
  name: true,
  category: true,
  holder: true,
  documentDate: true,
  description: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  updatedAt: true,
  versions: {
    select: { id: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: "desc" as const },
  },
} as const;
export async function registerDocumentRoutes(app: FastifyInstance) {
  app.get("/api/v1/documents", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, childId } = familyQuery
      .extend({ childId: z.string().uuid().optional() })
      .parse(request.query);
    const member = await membership(user.id, familyId, false, "documents");
    await childAccess(user.id, familyId, childId, "documents");
    const canChildren = member.role === "ADMIN" || member.sensitivePermissions.includes("children");
    return db.$transaction(async (tx) => {
      await audit(tx, user.id, familyId, "DOCUMENTS_READ", "Document");
      return tx.document.findMany({
        where: {
          familyId,
          ...(childId
            ? { childId }
            : canChildren
              ? { OR: [{ childId: null }, { child: { NOT: { blockedModules: { has: "documents" } } } }] }
              : { childId: null }),
        },
        select,
        orderBy: { createdAt: "desc" },
        take: 300,
      });
    });
  });
  app.post("/api/v1/documents", { bodyLimit: 15_000_000 }, async (request, reply) => {
    const user = await requireUser(request);
    verified(user);
    const { familyId, file, documentDate, ...body } = fields
      .extend({ familyId: z.string().uuid(), file: upload })
      .parse(request.body);
    await membership(user.id, familyId, true, "documents");
    await childAccess(user.id, familyId, body.childId, "documents");
    const stored = await storeFile(file.base64, file.mime, file.filename);
    try {
      const document = await db.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            ...body,
            ...stored,
            familyId,
            documentDate: documentDate ? new Date(documentDate) : null,
            versions: { create: stored },
          },
          select,
        });
        await audit(tx, user.id, familyId, "DOCUMENT_CREATED", "Document", document.id);
        return document;
      });
      return reply.code(201).send(document);
    } catch (error) {
      await db.objectDeletionJob.create({ data: { objectKey: stored.objectKey } });
      throw error;
    }
  });
  app.post("/api/v1/documents/:id/versions", { bodyLimit: 15_000_000 }, async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { id } = idParams.parse(request.params);
    const file = upload.parse(request.body);
    const original = await db.document.findUnique({ where: { id } });
    if (!original) throw new HttpError(404, "Documento não encontrado");
    await membership(user.id, original.familyId, true, "documents");
    await childAccess(user.id, original.familyId, original.childId, "documents");
    const stored = await storeFile(file.base64, file.mime, file.filename);
    try {
      return await db.$transaction(async (tx) => {
        const doc = await tx.document.update({
          where: { id },
          data: { ...stored, versions: { create: stored } },
          select,
        });
        await audit(tx, user.id, original.familyId, "DOCUMENT_VERSION_CREATED", "Document", id);
        return doc;
      });
    } catch (error) {
      await db.objectDeletionJob.create({ data: { objectKey: stored.objectKey } });
      throw error;
    }
  });
  app.get("/api/v1/documents/:id/download", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { id } = idParams.parse(request.params);
    const { versionId } = z.object({ versionId: z.string().uuid().optional() }).parse(request.query);
    const doc = await db.document.findUnique({ where: { id }, include: { versions: true } });
    if (!doc) throw new HttpError(404, "Documento não encontrado");
    await membership(user.id, doc.familyId, false, "documents");
    await childAccess(user.id, doc.familyId, doc.childId, "documents");
    const version = versionId ? doc.versions.find((item) => item.id === versionId) : doc;
    if (!version) throw new HttpError(404, "Versão não encontrada");
    await audit(db, user.id, doc.familyId, "DOCUMENT_DOWNLOADED", "Document", id);
    return { url: await fileUrl(version.objectKey), expiresIn: 60 };
  });
  app.delete("/api/v1/documents/:id", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const { id } = idParams.parse(request.params);
    const doc = await db.document.findUnique({ where: { id }, include: { versions: true } });
    if (!doc) throw new HttpError(404, "Documento não encontrado");
    await membership(user.id, doc.familyId, true, "documents");
    await childAccess(user.id, doc.familyId, doc.childId, "documents");
    await db.$transaction(async (tx) => {
      for (const objectKey of new Set([doc.objectKey, ...doc.versions.map((item) => item.objectKey)]))
        await tx.objectDeletionJob.create({ data: { objectKey } });
      await tx.document.delete({ where: { id } });
      await audit(tx, user.id, doc.familyId, "DOCUMENT_DELETED", "Document", id);
    });
    return { message: "Documento removido. Arquivos agendados para descarte." };
  });
}
