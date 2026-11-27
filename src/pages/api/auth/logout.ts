import { NextApiRequest, NextApiResponse } from "next";
import { withPulsar } from "../../../lib/pulsar";
import { clearSessionCookie } from "../../../lib/session";

// O cookie é HttpOnly: só o servidor consegue apagá-lo.
function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  clearSessionCookie(res);
  res.status(204).end();
}

// Monitorado pelo Pulsar (ver src/lib/pulsar.ts)
export default withPulsar(handler);
