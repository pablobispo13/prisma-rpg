import { NextApiRequest, NextApiResponse } from "next";
import { clearSessionCookie } from "../../../lib/session";

// O cookie é HttpOnly: só o servidor consegue apagá-lo.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  clearSessionCookie(res);
  res.status(204).end();
}
