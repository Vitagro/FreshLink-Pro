import { Router } from "express";
import type { Request, Response } from "express";
import {
  SADMIN_COOKIE,
  signSadminToken,
  verifySadminToken,
} from "../../lib/deviceGuard.js";

const router = Router();

const SB_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";

const SB_SRV =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.service_role ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

const ADMIN_ROLES = new Set(["super_super_admin", "super_admin", "admin"]);

async function verifySupabaseToken(bearerToken: string): Promise<{ id: string; role: string; email: string } | null> {
  if (!SB_SRV || !bearerToken) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_SRV, Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) return null;
    const user = await res.json() as { id: string; email?: string; role?: string; user_metadata?: { role?: string } };
    const role: string = user?.user_metadata?.role ?? user?.role ?? "";
    return { id: user.id, role, email: user.email ?? "" };
  } catch {
    return null;
  }
}

function extractBearer(req: Request): string {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

router.post("/session", async (req: Request, res: Response) => {
  const bearerToken = extractBearer(req);
  const { userId } = req.body as { userId?: string };

  if (!userId || !bearerToken) {
    res.status(400).json({ ok: false, error: "userId et token d'authentification requis" });
    return;
  }

  const user = await verifySupabaseToken(bearerToken);
  if (!user) {
    res.status(401).json({ ok: false, error: "Token invalide" });
    return;
  }
  if (user.id !== userId) {
    res.status(403).json({ ok: false, error: "userId ne correspond pas au token" });
    return;
  }
  if (!ADMIN_ROLES.has(user.role)) {
    res.status(403).json({ ok: false, error: "Permission insuffisante" });
    return;
  }

  try {
    const token = signSadminToken(userId);
    res.cookie(SADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

router.get("/session", (req: Request, res: Response) => {
  const token = (req.cookies as Record<string, string>)?.[SADMIN_COOKIE] ?? "";
  if (!token) {
    res.json({ valid: false });
    return;
  }
  const userId = verifySadminToken(token);
  res.json({ valid: !!userId, userId: userId ?? undefined });
});

router.delete("/session", (_req: Request, res: Response) => {
  res.clearCookie(SADMIN_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/verify", async (req: Request, res: Response) => {
  const bearerToken = extractBearer(req);

  if (!bearerToken || !SB_SRV) {
    res.status(401).json({ authorized: false, message: "Non authentifié" });
    return;
  }

  try {
    const user = await verifySupabaseToken(bearerToken);
    if (!user) {
      res.status(401).json({ authorized: false, message: "Token invalide" });
      return;
    }
    if (!ADMIN_ROLES.has(user.role)) {
      console.warn(`[Security] Admin access denied for user ${user.id} (role: ${user.role})`);
      res.status(403).json({ authorized: false, message: "Permission insuffisante" });
      return;
    }
    res.json({ authorized: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) {
    res.status(500).json({ authorized: false, message: "Erreur interne" });
  }
});

export default router;
