import { Router } from "express";
import type { Request, Response } from "express";

// ══════════════════════════════════════════════════════════════════
// /api/ext/shop-stats — Lecture du compteur analytics boutique
//   GET  ?days=7        → agrégats (total, aujourd'hui, par jour, top pages,
//                          régions, événements) + config d'affichage public
//   POST { config }     → enregistre quelles infos afficher sur le site
//                          (row id = "__config")
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

interface GpsPoint { lat: number; lng: number; region?: string; page?: string; t?: string; acc?: number }
interface DayRow { id: string; payload: { visits?: number; clicks?: number; pages?: Record<string, number>; regions?: Record<string, number>; events?: Record<string, number>; points?: GpsPoint[] } }

const DEFAULT_CONFIG = { afficher: true, showVisits: true, showClicks: false, showRegions: false, titre: "Visiteurs" };

function topN(obj: Record<string, number> = {}, n = 8): { label: string; count: number }[] {
  return Object.entries(obj).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, n);
}

router.get("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const days = Math.min(90, Math.max(1, Number(req.query["days"]) || 7));
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const headers = { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` };

  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_shop_analytics?id=gte.${start}&order=id.desc&limit=120`, { headers });
    const rows: DayRow[] = r.ok ? (await r.json()) as DayRow[] : [];
    // Lignes spéciales (config + en-ligne) récupérées EXPLICITEMENT : selon la
    // collation, "__online"/"__config" peuvent sortir de la plage de dates ci-dessus.
    try {
      const spRes = await fetch(`${SB_URL}/rest/v1/fl_shop_analytics?id=in.(__online,__config)&select=id,payload`, { headers });
      if (spRes.ok) {
        const sp: DayRow[] = (await spRes.json()) as DayRow[];
        for (const s of sp) if (!rows.some(row => row.id === s.id)) rows.push(s);
      }
    } catch { /* noop */ }
    const today = new Date().toISOString().slice(0, 10);

    const pages: Record<string, number> = {};
    const regions: Record<string, number> = {};
    const events: Record<string, number> = {};
    let points: GpsPoint[] = [];
    let totalVisits = 0, totalClicks = 0;
    // Visiteurs EN LIGNE (sessions actives < 3 min, depuis la ligne __online)
    let online = 0;
    try {
      const onlineRow = rows.find(row => row.id === "__online")?.payload as { sessions?: Record<string, number> } | undefined;
      const sessions = onlineRow?.sessions ?? {};
      const nowMs = Date.now();
      online = Object.values(sessions).filter(ts => nowMs - Number(ts) <= 180_000).length;
    } catch { /* noop */ }

    const parJour = rows
      .filter(row => !String(row.id).startsWith("__"))
      .map(row => {
        const p = row.payload || {};
        totalVisits += p.visits || 0;
        totalClicks += p.clicks || 0;
        for (const [k, v] of Object.entries(p.pages || {})) pages[k] = (pages[k] || 0) + v;
        for (const [k, v] of Object.entries(p.regions || {})) regions[k] = (regions[k] || 0) + v;
        for (const [k, v] of Object.entries(p.events || {})) events[k] = (events[k] || 0) + v;
        if (Array.isArray(p.points)) points = points.concat(p.points);
        return { date: row.id, visits: p.visits || 0, clicks: p.clicks || 0 };
      });
    // Points GPS exacts : plus récents d'abord, bornés
    points = points.filter(pt => pt && typeof pt.lat === "number" && typeof pt.lng === "number")
      .sort((a, b) => String(b.t ?? "").localeCompare(String(a.t ?? ""))).slice(0, 300);

    const todayRow = rows.find(row => row.id === today)?.payload || {};
    const configRow = rows.find(row => row.id === "__config")?.payload as Record<string, unknown> | undefined;
    const config = { ...DEFAULT_CONFIG, ...(configRow ?? {}) };

    res.json({
      ok: true,
      periode: { days, depuis: start },
      total: { visits: totalVisits, clicks: totalClicks },
      online,
      aujourdhui: { visits: todayRow.visits || 0, clicks: todayRow.clicks || 0 },
      parJour,
      topPages: topN(pages),
      regions: topN(regions),
      events: topN(events),
      points,
      config,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const body = (req.body ?? {}) as { config?: Record<string, unknown> };
  const config = { ...DEFAULT_CONFIG, ...(body.config ?? {}) };
  const headers = { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };

  try {
    await fetch(`${SB_URL}/rest/v1/fl_shop_analytics`, {
      method: "POST", headers,
      body: JSON.stringify({ id: "__config", payload: config, updated_at: new Date().toISOString() }),
    });
    res.json({ ok: true, config });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
