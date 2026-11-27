import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../lib/prisma";

/**
 * Health check usado pelo Pulsar. Também testa o banco: com o MongoDB fora do
 * ar o app "responde", mas nada funciona — então devolvemos 503.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return res.status(200).json({ status: "ok", db: "ok", message: "API funcionando perfeitamente!" });
  } catch (err) {
    console.error("[health] banco indisponível:", err);
    return res.status(503).json({ status: "error", db: "unreachable" });
  }
}
