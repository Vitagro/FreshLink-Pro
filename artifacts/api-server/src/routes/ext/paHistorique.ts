import { Router } from "express";
import type { Request, Response } from "express";

// ══════════════════════════════════════════════════════════════════
// /api/ext/pa-historique — Saisie PA marché de gros (Section 5)
//   Table : fl_pa_historique
//   Alimente la fonction SQL fl_pa_predit (pricing dynamique)
//
//   GET                              → liste tout (200 dernières)
//   GET ?article=VFP00046            → historique d'un article
//   GET ?fournisseur=VFS00001        → historique d'un fournisseur
//   GET ?dateMin=YYYY-MM-DD&dateMax=…
//   POST { articleId, fournisseurId, pa, volumeKg, dateMarche }
//   DELETE ?id=...
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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

async function sbFetch(path: string, init: RequestInit = {}): Promise<globalThis.Response> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      apikey: SB_SRV,
      Authorization: `Bearer ${SB_SRV}`,
    },
  });
}

router.get("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const article     = req.query["article"] as string | undefined;
  const fournisseur = req.query["fournisseur"] as string | undefined;
  const dateMin     = req.query["dateMin"] as string | undefined;
  const dateMax     = req.query["dateMax"] as string | undefined;

  try {
    // Schéma JSONB unifié : {id, payload, updated_at}. On lit le payload et on
    // filtre/trie côté serveur (les colonnes plates date_marche/article_id n'existent pas).
    const r = await sbFetch("fl_pa_historique?select=id,payload,updated_at&limit=2000");
    if (!r.ok) throw new Error(await r.text());
    const raw = await r.json() as { id: string; payload: Record<string, unknown>; updated_at: string }[];
    let rows: Record<string, unknown>[] = (Array.isArray(raw) ? raw : [])
      .filter(row => !String(row.id).startsWith("__"))
      .map(row => ({ id: row.id, ...(row.payload ?? {}), created_at: (row.payload?.created_at as string) ?? row.updated_at } as Record<string, unknown>));
    if (article)     rows = rows.filter(row => String(row.article_id ?? "") === article);
    if (fournisseur) rows = rows.filter(row => String(row.fournisseur_id ?? "") === fournisseur);
    if (dateMin)      rows = rows.filter(row => String(row.date_marche ?? "") >= dateMin);
    if (dateMax)      rows = rows.filter(row => String(row.date_marche ?? "") <= dateMax);
    rows.sort((a, b) => String(b.date_marche ?? "").localeCompare(String(a.date_marche ?? "")) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    res.json({ ok: true, data: rows.slice(0, 500) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const article = String(body.articleId ?? "");
  const pa      = Number(body.pa ?? 0) || 0;
  if (!article)  { res.status(400).json({ ok: false, error: "articleId requis" }); return; }
  if (pa <= 0)   { res.status(400).json({ ok: false, error: "pa doit être > 0" }); return; }

  const id = "PA" + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const payload = {
    article_id:     article,
    fournisseur_id: body.fournisseurId ? String(body.fournisseurId) : null,
    pa,
    volume_kg:      Number(body.volumeKg ?? 0) || 0,
    date_marche:    body.dateMarche ? String(body.dateMarche) : now.slice(0, 10),
    created_at:     now,
  };

  try {
    const r = await sbFetch("fl_pa_historique", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id, payload, updated_at: now }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true, entry: { id, ...payload } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.delete("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const id = req.query["id"] as string | undefined;
  if (!id) { res.status(400).json({ ok: false, error: "id requis" }); return; }

  try {
    const r = await sbFetch(`fl_pa_historique?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
