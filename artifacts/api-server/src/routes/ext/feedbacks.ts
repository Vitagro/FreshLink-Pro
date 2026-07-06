import { Router } from "express";
import type { Request, Response } from "express";

// ══════════════════════════════════════════════════════════════════
// /api/ext/feedbacks — Avis centralisés (mobile → BO temps réel)
//   POST { auteurId, auteurNom, auteurRole, note, categorie, message }
//   GET  ?statut=nouveau → liste pour le Back-Office
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
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.message || !String(body.message).trim()) {
    res.status(400).json({ ok: false, error: "message requis" });
    return;
  }

  const id = "FB" + Date.now().toString(36).toUpperCase();
  const row = {
    id,
    auteur_id: body.auteurId ?? null,
    auteur_nom: body.auteurNom ?? null,
    auteur_role: body.auteurRole ?? null,
    note: Number(body.note) || null,
    categorie: body.categorie ?? "general",
    message: String(body.message).trim(),
    statut: "nouveau",
    source: body.source ?? "mobile",
    created_at: new Date().toISOString(),
  };

  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_feedbacks`, {
      method: "POST",
      headers: {
        apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`,
        "Content-Type": "application/json", Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const statut = req.query["statut"] as string | undefined;
  let url = `${SB_URL}/rest/v1/fl_feedbacks?select=*&order=created_at.desc&limit=500`;
  if (statut) url += `&statut=eq.${encodeURIComponent(statut)}`;

  try {
    const r = await fetch(url, { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
