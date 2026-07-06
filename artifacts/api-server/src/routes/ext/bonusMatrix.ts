import { Router } from "express";
import type { Request, Response } from "express";

// ══════════════════════════════════════════════════════════════════
// /ext/bonus-matrix — CRUD matrice bonus (Section 3)
//   Table : fl_bonus_matrix (segment × famille)
//
//   GET                  → liste toute la matrice
//   POST  { segment, famille, tauxCa, tauxTonnage, coefMarge }
//   PATCH { id, ...patch }
//   DELETE ?id=...
//
//   Le calcul réel du bonus est dans la fonction SQL fl_calc_bonus
//   (garde-fou plafond global) appelée via /api/ext/commercial
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

const VALID_SEGMENTS = ["chr", "marchand", "particulier"] as const;

// ═══ GET ═══════════════════════════════════════════════════════════
router.get("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  try {
    // Schéma JSONB {id, payload, updated_at} : les colonnes plates segment/famille
    // n'existent pas (→ 42703). On lit le payload et on trie en JS.
    const r = await sbFetch("fl_bonus_matrix?select=id,payload&limit=500");
    if (!r.ok) throw new Error(await r.text());
    const raw = await r.json() as { id: string; payload: Record<string, unknown> }[];
    const data = (Array.isArray(raw) ? raw : [])
      .filter(row => !String(row.id).startsWith("__"))
      .map(row => ({ id: row.id, ...(row.payload ?? {}) }) as Record<string, unknown>)
      .sort((a, b) => String(a.segment ?? "").localeCompare(String(b.segment ?? "")) || String(a.famille ?? "").localeCompare(String(b.famille ?? "")));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ═══ POST ══════════════════════════════════════════════════════════
router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const segment = String(body.segment ?? "");
  if (!VALID_SEGMENTS.includes(segment as (typeof VALID_SEGMENTS)[number])) {
    res.status(400).json({ ok: false, error: `segment invalide (${VALID_SEGMENTS.join(", ")})` });
    return;
  }

  const famille = body.famille ? String(body.famille) : "TOUTES";
  // Unicité (segment, famille) → id déterministe (remplace la contrainte unique SQL)
  const slug = (s: string) => s.normalize("NFD").replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const id = body.id ? String(body.id) : `BM_${slug(segment)}_${slug(famille)}`;
  const payload = {
    segment,
    famille,
    taux_ca:      Number(body.tauxCa ?? 0)      || 0,
    taux_tonnage: Number(body.tauxTonnage ?? 0) || 0,
    coef_marge:   Number(body.coefMarge ?? 1)   || 1,
    actif:        body.actif === false ? false : true,
  };

  try {
    const r = await sbFetch("fl_bonus_matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id, payload, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true, cell: { id, ...payload } });
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
  if (body.tauxCa      !== undefined) patch.taux_ca      = Number(body.tauxCa) || 0;
  if (body.tauxTonnage !== undefined) patch.taux_tonnage = Number(body.tauxTonnage) || 0;
  if (body.coefMarge   !== undefined) patch.coef_marge   = Number(body.coefMarge) || 1;
  if (body.actif       !== undefined) patch.actif        = body.actif === true;
  if (body.famille     !== undefined) patch.famille      = String(body.famille);
  if (Object.keys(patch).length === 0) { res.status(400).json({ ok: false, error: "rien à modifier" }); return; }

  try {
    // JSONB : lire le payload existant, fusionner, ré-upsert
    const getRes = await sbFetch(`fl_bonus_matrix?id=eq.${encodeURIComponent(id)}&select=payload`);
    const existing = getRes.ok ? await getRes.json() : [];
    const current = (Array.isArray(existing) && existing[0]?.payload) ? existing[0].payload as Record<string, unknown> : {};
    const merged = { ...current, ...patch };
    const r = await sbFetch("fl_bonus_matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id, payload: merged, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true, cell: { id, ...merged } });
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
    const r = await sbFetch(`fl_bonus_matrix?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
