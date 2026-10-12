import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "./extToken.js";
import { SADMIN_COOKIE, verifySadminToken } from "./deviceGuard.js";

export const SESSION_COOKIE = "fl_auth_session";
const roles = new Set(["super_super_admin", "super_admin", "admin"]);

// Never trust a role or user ID supplied by a browser. Re-read the active
// account so demotions and disabled accounts take effect immediately.
export async function requireAccount(req: Request, res: Response, next: NextFunction) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.headers.authorization && req.headers.origin) {
    const trusted = new Set(["https://erp.vita-agro.com", ...(process.env.TRUSTED_ORIGINS ?? "").split(",").filter(Boolean)]);
    if (process.env.NODE_ENV !== "production") trusted.add("http://localhost:3000");
    if (!trusted.has(req.headers.origin)) { res.status(403).json({ error: "Origine non autorisée." }); return; }
  }
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7) : req.cookies?.[SESSION_COOKIE];
  const claims = bearer ? verifyToken(bearer) : null;
  const id = claims?.sub ?? verifySadminToken(req.cookies?.[SADMIN_COOKIE] ?? "");
  if (typeof id !== "string" || !id) {
    res.status(401).json({ error: "Connexion administrateur requise." }); return;
  }
  const url = process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { res.status(503).json({ error: "Service indisponible." }); return; }
  try {
    const response = await fetch(`${url}/rest/v1/fl_users?id=eq.${encodeURIComponent(id)}&select=payload&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error("Account lookup failed");
    const rows = await response.json() as { payload?: Record<string, unknown> }[];
    const account = rows[0]?.payload;
    if (!account?.actif) {
      res.status(403).json({ error: "Permission insuffisante." }); return;
    }
    res.locals.account = { ...account, id };
    res.locals.adminId = id;
    next();
  } catch { res.status(503).json({ error: "Vérification des droits indisponible." }); }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAccount(req, res, () => {
    if (!roles.has(String(res.locals.account?.role))) {
      res.status(403).json({ error: "Permission insuffisante." }); return;
    }
    next();
  });
}
