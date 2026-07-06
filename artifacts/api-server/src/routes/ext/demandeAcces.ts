import { Router } from "express";
import type { Request, Response } from "express";

// ══════════════════════════════════════════════════════════════
// POST /ext/demande-acces
// Reçoit les demandes d'accès pro depuis vita-fresh.netlify.app
// Enregistre dans fl_demandes_acces (Supabase)
// ══════════════════════════════════════════════════════════════

const router = Router();

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? process.env.VITE_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin":  origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { nom, telephone, type, societe, email, ville, volume, message, source, lang } = body as Record<string, string | undefined>;

    if (!nom?.trim() || !telephone?.trim() || !type?.trim()) {
      res.status(400).json({ error: "Champs requis : nom, telephone, type." });
      return;
    }

    // Enregistrement Supabase
    const r = await fetch(`${SB_URL}/rest/v1/fl_demandes_acces`, {
      method: "POST",
      headers: {
        apikey:          SB_ANON,
        Authorization:   `Bearer ${SB_ANON}`,
        "Content-Type":  "application/json",
        Prefer:          "return=minimal",
      },
      body: JSON.stringify({
        nom:       nom.trim(),
        telephone: telephone.trim(),
        type,
        societe:   societe?.trim() || null,
        email:     email?.trim()   || null,
        ville:     ville?.trim()   || null,
        volume:    volume          || null,
        message:   message?.trim() || null,
        source:    source          || "site-web",
        lang:      lang            || "fr",
        statut:    "nouveau",
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error("[demande-acces] Supabase error:", err);
      // On retourne quand même OK (le fallback WhatsApp côté site prend le relais)
    }

    res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[POST /ext/demande-acces]", e);
    res.status(500).json({ error: e.message ?? "Erreur serveur." });
  }
});

export default router;
