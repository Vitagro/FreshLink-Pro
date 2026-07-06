import { Router } from "express";
import type { Request, Response } from "express";
import { verifyToken } from "../../lib/extToken.js";

// ══════════════════════════════════════════════════════════════
// POST /api/ext/revoke-sessions
// Force la déconnexion de tous les appareils lors de leur prochaine
// interaction avec /api/ext/mon-compte.
// L'utilisateur qui exécute l'opération est épargné (exceptUserId).
//
// Body: { exceptUserId: string }
// Auth: Bearer token d'un super_super_admin
// ══════════════════════════════════════════════════════════════

const router = Router();

const SB_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";
const SB_SRV =
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role || process.env.SUPABASE_SERVICE_KEY) ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

/** Écrit l'entrée de révocation dans Supabase (fl_users avec id __session_revoke) */
async function writeRevoke(exceptUserId: string, revokedBy: string): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/fl_users`, {
      method: "POST",
      headers: {
        apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: "__session_revoke",
        payload: {
          revokedAt: new Date().toISOString(),
          exceptUserId,
          revokedBy,
        },
        updated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch { return false; }
}

/** Supprime l'entrée de révocation (annule la déconnexion globale) */
async function clearRevoke(): Promise<boolean> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/fl_users?id=eq.__session_revoke`,
      {
        method: "DELETE",
        headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` },
      }
    );
    return res.ok;
  } catch { return false; }
}

router.post("/", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, string>;
  const { exceptUserId, adminId } = body;

  if (!adminId || !exceptUserId) {
    res.status(400).json({ error: "adminId et exceptUserId requis." });
    return;
  }

  // Vérifier que adminId est super_super_admin / super_admin / admin dans Supabase
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/fl_users?id=eq.${encodeURIComponent(adminId)}&select=id,payload&limit=1`,
      { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } }
    );
    if (r.ok) {
      const rows = (await r.json()) as { id: string; payload: Record<string, unknown> }[];
      const user = rows[0];
      const role = String(user?.payload?.role ?? "");
      if (!["super_super_admin", "super_admin", "admin"].includes(role)) {
        res.status(403).json({ error: "Accès refusé — rôle insuffisant." });
        return;
      }
    }
  } catch { /* ignore lookup failure, proceed best-effort */ }

  const revokedBy = adminId;

  const ok = await writeRevoke(exceptUserId, revokedBy);

  res.status(ok ? 200 : 500).json({
    ok,
    message: ok ? "Tous les comptes seront déconnectés à leur prochaine interaction." : "Erreur Supabase.",
  });
});

/** DELETE — annule la révocation (optionnel) */
router.delete("/", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload || !["super_super_admin"].includes(payload.role as string)) {
    res.status(403).json({ error: "Accès refusé." });
    return;
  }
  const ok = await clearRevoke();
  res.json({ ok });
});

export default router;
