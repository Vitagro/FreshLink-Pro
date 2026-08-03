import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../../lib/deviceGuard.js";

// ══════════════════════════════════════════════════════════════════
// /api/ext/commercial — Moteur commercial (expose les fonctions SQL V3)
//
//   Protege par requireDeviceApi (device BO connu) — seuls
//   BOPaHistorique.tsx et BOMoteurCommercial.tsx appellent cette route.
//   POST { action, ...params }
//     action = "gratuite"  → fl_calc_gratuite(article, segment, qte)
//     action = "bonus"     → fl_calc_bonus(prevendeur, ca, segment, famille)
//     action = "cash"      → fl_calc_cash_terrain(date)
//     action = "pa_predit" → fl_pa_predit(article)
//     action = "pricing"   → fl_pricing_dynamique(article, cost_log, marge, client)
// Calculs 100% côté serveur → anti-fraude (les prévendeurs ne peuvent pas
// manipuler remises/gratuités depuis le mobile).
// ══════════════════════════════════════════════════════════════════

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

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  if (requireDeviceApi(req)) { res.status(401).json({ ok: false, error: "Device non autorisé" }); return; }
  next();
});

/** Appelle une fonction PL/pgSQL via PostgREST RPC. */
async function rpc(fn: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SB_SRV,
      Authorization: `Bearer ${SB_SRV}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`RPC ${fn} échec : ${txt}`);
  }
  return res.json();
}

router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) {
    res.status(500).json({ ok: false, error: "service_role manquante" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? "");

  try {
    let result: unknown;
    switch (action) {
      case "gratuite":
        result = await rpc("fl_calc_gratuite", {
          p_article: String(body.article ?? ""),
          p_segment: String(body.segment ?? "tous"),
          p_qte: Number(body.qte) || 0,
        });
        res.json({ ok: true, action, qteOfferte: result });
        return;

      case "bonus":
        result = await rpc("fl_calc_bonus", {
          p_prevendeur: String(body.prevendeur ?? ""),
          p_ca: Number(body.ca) || 0,
          p_segment: String(body.segment ?? "particulier"),
          p_famille: String(body.famille ?? "TOUTES"),
        });
        res.json({ ok: true, action, bonus: result });
        return;

      case "cash":
        result = await rpc("fl_calc_cash_terrain", {
          p_date: String(body.date ?? new Date().toISOString().slice(0, 10)),
        });
        res.json({ ok: true, action, cashTerrain: result });
        return;

      case "pa_predit":
        result = await rpc("fl_pa_predit", { p_article: String(body.article ?? "") });
        res.json({ ok: true, action, paPredit: result });
        return;

      case "pricing":
        result = await rpc("fl_pricing_dynamique", {
          p_article: String(body.article ?? ""),
          p_cost_log: Number(body.costLog) || 0,
          p_marge_cible: Number(body.margeCible) || 0,
          p_client: String(body.client ?? ""),
        });
        res.json({ ok: true, action, prixConseille: result });
        return;

      default:
        res.status(400).json({ ok: false, error: `action inconnue : ${action}` });
        return;
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
