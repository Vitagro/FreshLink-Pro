import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

// Un appel entrant reste "retrouvable" à la réouverture de l'app pendant ce
// délai — aligné sur les 35s de sonnerie côté client (CallCenter.tsx) + une
// petite marge pour le temps de réouverture de l'app.
const PENDING_TTL_MS = 40_000;

const SB_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";
const SB_SRV =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.service_role ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

// Enregistre/remplace l'appel en attente pour ce destinataire (upsert sur
// target_id — un seul appel entrant affichable à la fois, comme le reste de
// CallCenter.tsx). Appelé par startCall() en plus du signal temps réel.
router.post("/offer", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }
  const { targetId, callerId, callerName, offer } = req.body as {
    targetId?: string; callerId?: string; callerName?: string; offer?: unknown;
  };
  if (!targetId || !callerId || !callerName || !offer) {
    res.status(400).json({ ok: false, error: "targetId, callerId, callerName et offer requis" });
    return;
  }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_active_calls?on_conflict=target_id`, {
      method: "POST",
      headers: {
        apikey: SB_SRV,
        Authorization: `Bearer ${SB_SRV}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        target_id: targetId,
        caller_id: callerId,
        caller_name: callerName,
        offer,
        created_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Consulté au chargement de l'app / retour au premier plan : y a-t-il un
// appel entrant encore valide (non expiré) pour cet utilisateur ?
router.get("/pending", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }
  const userId = req.query["userId"] as string | undefined;
  if (!userId) { res.status(400).json({ ok: false, error: "userId requis" }); return; }
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/fl_active_calls?select=caller_id,caller_name,offer,created_at&target_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } },
    );
    if (!r.ok) throw new Error(await r.text());
    const rows = (await r.json()) as { caller_id: string; caller_name: string; offer: unknown; created_at: string }[];
    const row = rows[0];
    if (!row || Date.now() - new Date(row.created_at).getTime() > PENDING_TTL_MS) {
      res.json({ ok: true, call: null });
      return;
    }
    res.json({ ok: true, call: { callerId: row.caller_id, callerName: row.caller_name, offer: row.offer } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Nettoyage : accepté, raccroché ou sonnerie expirée (des DEUX côtés — le
// destinataire nettoie sa propre ligne, l'appelant nettoie aussi par
// précaution si son délai de sonnerie expire avant toute réponse).
router.delete("/offer", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }
  const { targetId } = req.body as { targetId?: string };
  if (!targetId) { res.status(400).json({ ok: false, error: "targetId requis" }); return; }
  try {
    await fetch(`${SB_URL}/rest/v1/fl_active_calls?target_id=eq.${encodeURIComponent(targetId)}`, {
      method: "DELETE",
      headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, Prefer: "return=minimal" },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
