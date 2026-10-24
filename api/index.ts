import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../apps/api/src/app.js";

type VercelRequest = IncomingMessage & { url?: string };
type VercelResponse = ServerResponse;

let appPromise: ReturnType<typeof buildApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rewrittenUrl = new URL(req.url ?? "/", "https://vercel.internal");
  const apiPath = rewrittenUrl.searchParams.get("__apiPath");
  if (!apiPath?.startsWith("v1/")) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  rewrittenUrl.searchParams.delete("__apiPath");
  req.url = `/api/${apiPath}${rewrittenUrl.search ? rewrittenUrl.search : ""}`;

  appPromise ??= buildApp();
  const app = await appPromise;
  await app.ready();
  app.server.emit("request", req, res);
}
