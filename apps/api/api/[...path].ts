import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";

type VercelRequest = IncomingMessage & { body?: unknown };
type VercelResponse = ServerResponse;

let appPromise: ReturnType<typeof buildApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  appPromise ??= buildApp();
  const app = await appPromise;
  await app.ready();
  app.server.emit("request", req, res);
}
