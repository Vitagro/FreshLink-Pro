import { Router } from "express";
import type { Request, Response } from "express";

// ══════════════════════════════════════════════════════════════════
// /api/ext/pricing-rules — CRUD règles de prix (gratuités + remises)
//   Table : fl_pricing_rules
//
//   GET                  → liste toutes les règles (tri priorité)
//   GET ?actif=true      → seulement actives
//   GET ?segment=chr     → filtre segment
//   POST { type, cible_segment, palier_qte, palier_offert, ... }
//   PATCH { id, ...patch }
//   DELETE ?id=...
//
//   Types supportés :
//     - gratuite_palier : 10 caisses achetées → 1 offerte
//     - remise_pct      : remise % sur le total
//     - remise_montant  : remise montant fixe MAD
//     - remise_cascade  : remise dégressive
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
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

async function sbFetch(path: string, init: RequestInit = {}): ReturnType<typeof fetch> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      apikey: SB_SRV,
      Authorization: `Bearer ${SB_SRV}`,
    },
  });
}

const VALID_TYPES = ["gratuite_palier", "remise_pct", "remise_montant", "remise_cascade"] as const;
const VALID_SEGMENTS = ["chr", "marchand", "particulier", "tous"] as const;

// ═══ GET ═══════════════════════════════════════════════════════════
router.get("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const actif = req.query["actif"] as string | undefined;
  const segment = req.query["segment"] as string | undefined;

  try {
    // Schéma JSONB {id, payload, updated_at} : on lit le payload et on filtre/trie en JS
    const r = await sbFetch("fl_pricing_rules?select=id,payload,updated_at&limit=500");
    if (!r.ok) throw new Error(await r.text());
    const raw = await r.json() as { id: string; payload: Record<string, unknown> }[];
    let rows: Record<string, unknown>[] = (Array.isArray(raw) ? raw : [])
      .filter(row => !String(row.id).startsWith("__"))
      .map(row => ({ id: row.id, ...(row.payload ?? {}) } as Record<string, unknown>));
    if (actif != null) rows = rows.filter(row => (row.actif !== false) === (actif === "true"));
    if (segment) rows = rows.filter(row => String(row.cible_segment ?? "tous") === segment);
    rows.sort((a, b) => (Number(a.priorite ?? 100) - Number(b.priorite ?? 100)) || String(a.nom ?? "").localeCompare(String(b.nom ?? "")));
    res.json({ ok: true, data: rows.slice(0, 300) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ═══ POST ══════════════════════════════════════════════════════════
router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const type = String(body.type ?? "");
  const segment = String(body.cibleSegment ?? body.segment ?? "tous");
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    res.status(400).json({ ok: false, error: `type invalide (${VALID_TYPES.join(", ")})` });
    return;
  }
  if (!VALID_SEGMENTS.includes(segment as (typeof VALID_SEGMENTS)[number])) {
    res.status(400).json({ ok: false, error: `segment invalide (${VALID_SEGMENTS.join(", ")})` });
    return;
  }
  if (!body.nom || !String(body.nom).trim()) {
    res.status(400).json({ ok: false, error: "nom requis" });
    return;
  }

  // Validation cohérence par type
  if (type === "gratuite_palier") {
    const palierQte = Number(body.palierQte ?? 0) || 0;
    const palierOffert = Number(body.palierOffert ?? 0) || 0;
    if (palierQte <= 0 || palierOffert <= 0) {
      res.status(400).json({ ok: false, error: "Pour une gratuité, palier_qte et palier_offert doivent être > 0" });
      return;
    }
  }
  if (type === "remise_pct" || type === "remise_montant" || type === "remise_cascade") {
    const remiseValeur = Number(body.remiseValeur ?? 0) || 0;
    if (remiseValeur <= 0) {
      res.status(400).json({ ok: false, error: "Pour une remise, remise_valeur doit être > 0" });
      return;
    }
  }

  const id = body.id ? String(body.id) : "PR" + Date.now().toString(36).toUpperCase();
  const payload = {
    nom: String(body.nom).trim(),
    type,
    cible_segment: segment,
    cible_famille: body.cibleFamille ? String(body.cibleFamille) : null,
    cible_article: body.cibleArticle ? String(body.cibleArticle) : null,
    palier_qte: Number(body.palierQte ?? 0) || 0,
    palier_offert: Number(body.palierOffert ?? 0) || 0,
    remise_valeur: Number(body.remiseValeur ?? 0) || 0,
    date_debut: body.dateDebut ? String(body.dateDebut) : null,
    date_fin: body.dateFin ? String(body.dateFin) : null,
    priorite: Number(body.priorite ?? 100) || 100,
    actif: body.actif === false ? false : true,
  };

  try {
    const r = await sbFetch("fl_pricing_rules", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id, payload, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true, rule: { id, ...payload } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ═══ PATCH ═════════════════════════════════════════════════════════
router.patch("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.id) { res.status(400).json({ ok: false, error: "id requis" }); return; }

  const id = String(body.id);
  const patch: Record<string, unknown> = {};
  if (body.nom !== undefined) patch.nom = String(body.nom);
  if (body.actif !== undefined) patch.actif = body.actif === true;
  if (body.cibleFamille !== undefined) patch.cible_famille = body.cibleFamille === null ? null : String(body.cibleFamille);
  if (body.cibleArticle !== undefined) patch.cible_article = body.cibleArticle === null ? null : String(body.cibleArticle);
  if (body.palierQte !== undefined) patch.palier_qte = Number(body.palierQte) || 0;
  if (body.palierOffert !== undefined) patch.palier_offert = Number(body.palierOffert) || 0;
  if (body.remiseValeur !== undefined) patch.remise_valeur = Number(body.remiseValeur) || 0;
  if (body.priorite !== undefined) patch.priorite = Number(body.priorite) || 100;
  if (body.dateDebut !== undefined) patch.date_debut = body.dateDebut === null ? null : String(body.dateDebut);
  if (body.dateFin !== undefined) patch.date_fin = body.dateFin === null ? null : String(body.dateFin);
  if (Object.keys(patch).length === 0) { res.status(400).json({ ok: false, error: "rien à modifier" }); return; }

  try {
    // JSONB : lire le payload existant, fusionner le patch, ré-upsert la ligne complète
    const getRes = await sbFetch(`fl_pricing_rules?id=eq.${encodeURIComponent(id)}&select=payload`);
    const existing = getRes.ok ? (await getRes.json()) as { payload?: Record<string, unknown> }[] : [];
    const current = (Array.isArray(existing) && existing[0]?.payload) ? existing[0].payload as Record<string, unknown> : {};
    const merged = { ...current, ...patch };
    const r = await sbFetch("fl_pricing_rules", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id, payload: merged, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true, rule: { id, ...merged } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ═══ DELETE ════════════════════════════════════════════════════════
router.delete("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const id = req.query["id"] as string | undefined;
  if (!id) { res.status(400).json({ ok: false, error: "id requis" }); return; }

  try {
    const r = await sbFetch(`fl_pricing_rules?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
