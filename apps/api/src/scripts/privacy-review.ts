import "dotenv/config";
import { db } from "../db.js";

const [requestId, nextStatus, operatorId, ...noteParts] = process.argv.slice(2);
const note = noteParts.join(" ").trim();
const statuses = ["IN_REVIEW", "COMPLETED", "REJECTED"];
try {
  if (!requestId || !statuses.includes(nextStatus) || !operatorId || !note)
    throw new Error(
      "Uso: npm run privacy:review -- <requestId> <IN_REVIEW|COMPLETED|REJECTED> <operatorUserId> <motivo>",
    );
  const allowed = new Set(
    (process.env.FAMILYHUB_OPERATOR_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!allowed.has(operatorId))
    throw new Error("Operador não autorizado. Configure FAMILYHUB_OPERATOR_IDS fora do repositório.");
  const operator = await db.user.findFirst({
    where: { id: operatorId, emailVerifiedAt: { not: null } },
    select: { id: true },
  });
  if (!operator) throw new Error("Operador inexistente ou sem e-mail verificado.");
  const current = await db.privacyRequest.findUnique({ where: { id: requestId } });
  if (!current || current.kind === "EXPORT") throw new Error("Solicitação não encontrada ou não revisável.");
  const allowedNext =
    current.status === "REQUESTED"
      ? ["IN_REVIEW"]
      : current.status === "IN_REVIEW"
        ? ["COMPLETED", "REJECTED"]
        : [];
  if (!allowedNext.includes(nextStatus)) throw new Error("Transição de estado não permitida.");
  await db.$transaction(async (tx) => {
    const changed = await tx.privacyRequest.updateMany({
      where: { id: current.id, status: current.status },
      data: {
        status: nextStatus,
        reviewedById: operatorId,
        reviewedAt: new Date(),
        resolutionNote: note.slice(0, 1000),
      },
    });
    if (!changed.count) throw new Error("Solicitação alterada em paralelo; atualize e tente novamente.");
    await tx.auditLog.create({
      data: {
        actorId: operatorId,
        action: "PRIVACY_REVIEW_" + nextStatus,
        entity: "PrivacyRequest",
        entityId: current.id,
        metadata: { kind: current.kind, scope: current.scope, note: note.slice(0, 1000) },
      },
    });
  });
  process.stdout.write(
    "Estado da solicitação atualizado e auditado. Nenhum dado da conta ou família foi apagado.\n",
  );
} finally {
  await db.$disconnect();
}
