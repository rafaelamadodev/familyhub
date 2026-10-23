import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerFamilyRoutes } from "./modules/families/routes.js";
import { registerProfileRoutes } from "./modules/profile/routes.js";
import { registerTaskRoutes } from "./modules/tasks/routes.js";
import { registerShoppingRoutes } from "./modules/shopping/routes.js";
import { registerEventRoutes } from "./modules/events/routes.js";
import { registerDashboardRoutes } from "./modules/dashboard/routes.js";
import { registerChildrenRoutes } from "./modules/children/routes.js";
import { registerGrowthRoutes } from "./modules/children/growth-routes.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerDocumentRoutes } from "./modules/documents/routes.js";
import { registerFinanceRoutes } from "./modules/finance/routes.js";
import { registerNotificationRoutes } from "./modules/notifications/routes.js";
import { registerPrivacyRoutes } from "./modules/privacy/routes.js";
import { HttpError } from "./shared/domain.js";
import { db } from "./db.js";
import { registerSearchRoutes } from "./modules/search/routes.js";
import { registerGoogleCalendarRoutes } from "./modules/integrations/google-calendar-routes.js";
import { openApiDocument } from "./shared/openapi.js";
import cookie from "@fastify/cookie";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { collectDefaultMetrics, register as metricsRegistry } from "prom-client";
import type { OpenAPIV3 } from "openapi-types";

export async function buildApp() {
  const app = Fastify({ bodyLimit: 4 * 1024 * 1024, logger: { level: "warn" } });
  await app.register(cookie);
  await app.register(swagger, {
    mode: "static",
    specification: { document: openApiDocument as unknown as OpenAPIV3.Document },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  collectDefaultMetrics({ register: metricsRegistry });
  const origins = (process.env.WEB_ORIGIN ?? "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  await app.register(cors, {
    credentials: true,
    origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
    return payload;
  });
  app.get("/health", async () => ({ status: "ok", service: "api" }));
  app.get("/metrics", async (_request, reply) =>
    reply.type(metricsRegistry.contentType).send(await metricsRegistry.metrics()),
  );
  app.get("/health/ready", async (_request, reply) => {
    try {
      await db.$queryRawUnsafe("SELECT 1");
      if (process.env.REDIS_URL) {
        const { redis } = await import("./shared/queue.js");
        await redis!.ping();
      }
      return { status: "ready", database: "ok", ...(process.env.REDIS_URL ? { redis: "ok" } : {}) };
    } catch {
      return reply.code(503).send({ status: "not_ready", database: "or_dependency_unavailable" });
    }
  });
  await registerAuthRoutes(app);
  await registerProfileRoutes(app);
  await registerFamilyRoutes(app);
  await registerTaskRoutes(app);
  await registerShoppingRoutes(app);
  await registerEventRoutes(app);
  await registerDashboardRoutes(app);
  await registerSearchRoutes(app);
  await registerChildrenRoutes(app);
  await registerGrowthRoutes(app);
  await registerHealthRoutes(app);
  await registerDocumentRoutes(app);
  await registerFinanceRoutes(app);
  await registerNotificationRoutes(app);
  await registerPrivacyRoutes(app);
  await registerGoogleCalendarRoutes(app);
  app.get("/api/v1/openapi.json", async () => openApiDocument);
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        message: "Dados inválidos. Confira os campos informados.",
        fields: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ message: error.message });
    const known = error as { statusCode?: number; code?: string };
    if (known.statusCode === 401)
      return reply.code(401).send({ message: "Sessão expirada. Entre novamente." });
    if (known.statusCode === 413)
      return reply.code(413).send({ message: "Arquivo ou formulário excede o limite permitido" });
    if (known.statusCode === 400)
      return reply.code(400).send({
        message: "Não foi possível processar esta solicitação. Confira os dados e tente novamente.",
      });
    if (["P2002", "P2034"].includes(known.code ?? ""))
      return reply
        .code(409)
        .send({ message: "Não foi possível concluir. Atualize os dados e tente novamente." });
    if (known.code === "P2025") return reply.code(404).send({ message: "Registro não encontrado" });
    // Never log error objects: Prisma messages can contain submitted personal data.
    app.log.error({ requestId: _request.id, code: known.code ?? "INTERNAL_ERROR" }, "Falha na operação");
    return reply.code(500).send({ message: "Não foi possível concluir a operação" });
  });
  return app;
}
