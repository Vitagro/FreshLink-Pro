import { Router } from "express";
import type { Request, Response } from "express";

// ══════════════════════════════════════════════════════════════
// GET /ext/secteurs — liste publique des secteurs (pour le shop et tout
// formulaire public qui doit proposer les MÊMES secteurs que le BO/mobile,
// au lieu d'un champ texte libre déconnecté de la config Zones & Secteurs).
//
// Endpoint public (pas de device-guard) : le shop est visité par des
// inconnus sans cookie d'appareil ERP. Ne renvoie que des noms de secteur
// (aucune donnée sensible) — lecture service_role de fl_notices
// (__zones_config) + fl_clients pour les secteurs déjà en usage.
// ══════════════════════════════════════════════════════════════

const router = Router();

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "https://bxdqkigoidwnscsjafwd.supabase.co";
const SB_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role || process.env.SUPABASE_SERVICE_KEY || "";

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

router.get("/", async (_req: Request, res: Response) => {
  if (!SB_SRV) { res.json({ secteurs: [] }); return; }
  const hdr = { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` };
  try {
    const [notices, clients] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/fl_notices?id=eq.__zones_config&select=payload`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${SB_URL}/rest/v1/fl_clients?select=payload`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]) as [Array<{ payload?: { allSecteurs?: string[] } }>, Array<{ payload?: { secteur?: string } }>];

    const fromConfig = notices?.[0]?.payload?.allSecteurs ?? [];
    const fromClients = (clients ?? []).map(c => c.payload?.secteur).filter((s): s is string => !!s);
    const secteurs = [...new Set([...fromConfig, ...fromClients])].sort();
    res.json({ secteurs });
  } catch (e) {
    res.status(500).json({ secteurs: [], error: String(e) });
  }
});

export default router;
