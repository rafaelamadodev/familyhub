import type { IncomingMessage, ServerResponse } from "node:http";
import { runMaintenance } from "../../src/maintenance.js";

type CronRequest = IncomingMessage & { method?: string };
type CronResponse = ServerResponse & {
  status: (code: number) => CronResponse;
  json: (body: unknown) => void;
};

export default async function handler(req: CronRequest, res: CronResponse) {
  if (req.method !== "GET") return res.status(405).json({ message: "Método não permitido" });
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.authorization !== `Bearer ${expected}`)
    return res.status(401).json({ message: "Não autorizado" });
  await runMaintenance();
  return res.status(200).json({ ok: true });
}
