import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../apps/api/src/app.js";

type VercelRequest = IncomingMessage & { body?: unknown };
type VercelResponse = ServerResponse;

let appPromise: ReturnType<typeof buildApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  appPromise ??= buildApp();
  const app = await appPromise;
  await app.ready();

  // Fastify can serve the native Node request/response pair used by Vercel
  // Functions. Keeping the app instance warm avoids rebuilding the route tree
  // on every invocation in a reused function instance.
  app.server.emit("request", req, res);
}
