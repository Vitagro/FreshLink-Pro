import { Router } from "express";
import type { Request, Response } from "express";

// ══════════════════════════════════════════════════════════════════
// /api/ext/promo — Validation d'un code promo (appelé par la boutique)
//   GET ?code=XYZ&total=350
//   → { ok, valid, type, valeur, label, remise, minCommande, reason? }
// Codes gérés dans le back-office (table fl_coupons, {id=CODE, payload}).
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

interface Coupon {
  code?: string;
  actif?: boolean;
  type?: "pourcentage" | "montant";
  valeur?: number;
  label?: string;
  expiration?: string; // ISO date — au-delà, invalide
  minCommande?: number; // total minimum requis (DH)
  usageMax?: number;
  usageCount?: number;
}

router.get("/", async (req: Request, res: Response) => {
  const code = String(req.query["code"] ?? "").trim().toUpperCase();
  const total = Number(req.query["total"]) || 0;

  if (!code) { res.json({ ok: true, valid: false, reason: "Code vide" }); return; }
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_coupons?id=eq.${encodeURIComponent(code)}&select=payload`, {
      headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` },
    });
    const rows = r.ok ? (await r.json()) as { payload?: Coupon }[] : [];
    const c: Coupon = rows[0]?.payload ?? {};

    if (!rows.length) { res.json({ ok: true, valid: false, reason: "Code introuvable" }); return; }
    if (c.actif === false) { res.json({ ok: true, valid: false, reason: "Code désactivé" }); return; }
    if (c.expiration && new Date(c.expiration) < new Date()) {
      res.json({ ok: true, valid: false, reason: "Code expiré" });
      return;
    }
    if (c.usageMax && (c.usageCount ?? 0) >= c.usageMax) {
      res.json({ ok: true, valid: false, reason: "Code épuisé" });
      return;
    }
    if (c.minCommande && total > 0 && total < c.minCommande) {
      res.json({ ok: true, valid: false, reason: `Minimum ${c.minCommande} DH` });
      return;
    }

    const validTypes = ["montant", "pourcentage", "livraison_gratuite", "article_gratuit"] as const;
    const type = (validTypes as readonly string[]).includes(String(c.type)) ? String(c.type) : "pourcentage";
    const valeur = Number(c.valeur) || 0;
    // Remise sur les articles : montant/% classiques ; article_gratuit = remise = valeur (DH offerts).
    // livraison_gratuite = aucune remise article mais drapeau livraisonGratuite (le shop met la livraison à 0).
    let remise = 0;
    if (total > 0) {
      if (type === "montant" || type === "article_gratuit") remise = Math.min(valeur, total);
      else if (type === "pourcentage") remise = Math.round(total * valeur / 100 * 100) / 100;
    }
    const livraisonGratuite = type === "livraison_gratuite";

    res.json({
      ok: true, valid: true, code, type, valeur, remise, livraisonGratuite,
      label: c.label ?? "", minCommande: c.minCommande ?? 0,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
