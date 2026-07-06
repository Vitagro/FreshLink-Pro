import { Router } from "express";
import type { Request, Response } from "express";
import { verifyToken } from "../../lib/extToken.js";

// ══════════════════════════════════════════════════════════════
// GET /api/ext/mon-compte — Profil du client connecté
// Header requis: Authorization: Bearer <token>
// Retourne: profil, points fidélité, remises, commandes récentes
// ══════════════════════════════════════════════════════════════

const router = Router();

const SB_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SB_SRV =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.service_role ||
  process.env.SUPABASE_SERVICE_KEY ||
  SB_ANON;

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

async function sbGet(table: string, filter: string): Promise<unknown[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${SB_ANON}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return [];
  return (await res.json()) as unknown[];
}

/**
 * Lecture {id, payload} aplatie avec le service role (bypass RLS).
 * fl_users / fl_clients sont stockés en JSONB {id, payload} — on aplatit pour
 * accéder de manière fiable à role / chrRole / categorie (le schéma plat est cassé).
 */
async function sbGetFlat(table: string, filter: string): Promise<any[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}&select=id,payload`, {
    headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` },
  });
  if (!res.ok) return [];
  const rows = await res.json() as { id: string; payload?: Record<string, unknown> }[];
  return rows.map(r => ({ id: r.id, ...(r.payload && typeof r.payload === "object" ? r.payload : {}) }));
}

router.get("/", async (req: Request, res: Response) => {
  // 1. Vérification du token
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Token requis." });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token invalide ou expiré. Veuillez vous reconnecter." });
    return;
  }

  const userId = payload.userId as string;
  const clientId = payload.clientId as string | null;

  try {
    // 2. Vérifier révocation globale de session
    const revokeRows = await (async () => {
      try {
        const r = await fetch(
          `${SB_URL}/rest/v1/fl_users?id=eq.__session_revoke&select=id,payload&limit=1`,
          { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } }
        );
        if (!r.ok) return [];
        return await r.json() as { id: string; payload: Record<string, unknown> }[];
      } catch { return []; }
    })();
    if (revokeRows.length > 0) {
      const rv = revokeRows[0].payload ?? {};
      const exceptUserId = String(rv.exceptUserId ?? "");
      if (userId !== exceptUserId) {
        res.status(401).json({ error: "Session révoquée par l'administrateur. Veuillez vous reconnecter.", revoked: true });
        return;
      }
    }

    // 3. Récupérer l'utilisateur (service role, {id,payload} aplati)
    const users = await sbGetFlat("fl_users", `id=eq.${encodeURIComponent(userId)}&limit=1`);
    if (!users || users.length === 0) {
      res.status(404).json({ error: "Utilisateur introuvable." });
      return;
    }
    const user = users[0];

    if (user.actif === false) {
      res.status(403).json({ error: "Compte désactivé." });
      return;
    }

    // 3. Récupérer le profil client (service role, {id,payload} aplati)
    let client: any = null;
    if (clientId) {
      const clients = await sbGetFlat("fl_clients", `id=eq.${encodeURIComponent(clientId)}&limit=1`);
      if (clients && clients.length > 0) client = clients[0];
    }

    // ── Hiérarchie CHR : propriétaire (→ ERP) vs gérant (→ shop) ───────────────
    const rawChrRole = String(user.chrRole ?? user.chr_role ?? user.sousRole ?? "").toLowerCase();
    const chrRole: "proprietaire" | "gerant" | null =
      (user.role === "client_proprietaire" || rawChrRole === "proprietaire") ? "proprietaire"
      : (user.role === "client_gerant" || rawChrRole === "gerant") ? "gerant"
      : null;

    // 4. Récupérer les commandes récentes (max 10)
    let commandes: any[] = [];
    if (clientId) {
      const raw = await sbGet("fl_commandes", `client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=10&select=id,numero,statut,montant_ttc,created_at`) as any[];
      commandes = (raw || []).map(c => ({
        id: c.id,
        numero: c.numero ?? c.id?.slice(0, 8),
        statut: c.statut ?? "en_cours",
        montant: c.montant_ttc ?? c.montant ?? 0,
        date: c.created_at,
      }));
    }

    // 5. Réponse
    res.status(200).json({
      chrRole,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        chrRole,
        categorie: client?.categorie ?? null,
        phone: user.phone ?? user.telephone ?? null,
      },
      client: {
        id: clientId,
        nom: client?.nom ?? user.name,
        categorie: client?.categorie ?? null,
        segment: client?.segment ?? "standard",
        ville: client?.ville ?? client?.zone ?? null,
        loyaltyPoints: client?.loyaltyPoints ?? 0,
        loyaltyOptIn: client?.loyaltyOptIn ?? true,
        remisePct: client?.remisePct ?? 0,
        remiseActive: client?.remiseActive ?? false,
        promotions: client?.promotions ?? [],
        creditSolde: client?.creditSolde ?? 0,
        plafondCredit: client?.plafondCredit ?? 0,
      },
      commandes,
      tokenExp: payload.exp,
    });
  } catch (e: any) {
    console.error("[GET /api/ext/mon-compte]", e);
    res.status(500).json({ error: e.message ?? "Erreur serveur." });
  }
});

export default router;
