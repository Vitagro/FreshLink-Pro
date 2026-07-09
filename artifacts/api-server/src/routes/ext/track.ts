import { Router } from "express";
import type { Request, Response } from "express";

// ══════════════════════════════════════════════════════════════════
// POST /api/ext/track — Reception des evenements analytics boutique
//   { type: "view",  page }              → +1 visite du jour, +1 page
//   { type: "click", label }             → +1 clic du jour, +1 evenement
//   { type: "point", lat, lng, acc }     → point GPS (best-effort, opt-in)
//   { type: "ping",  sid }               → heartbeat "en ligne" (session)
// Alimente la table fl_shop_analytics lue par /api/ext/shop-stats.
// ══════════════════════════════════════════════════════════════════

const router = Router();

const SB_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";
const SB_SRV =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role || process.env.SUPABASE_SERVICE_KEY || "";

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

interface DayPayload {
  visits?: number;
  clicks?: number;
  pages?: Record<string, number>;
  regions?: Record<string, number>;
  events?: Record<string, number>;
  points?: { lat: number; lng: number; acc?: number; t?: string; page?: string }[];
}

function readHeaders() {
  return { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` };
}
function writeHeaders() {
  return { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
}

router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const body = (req.body ?? {}) as { type?: string; page?: string; label?: string; lat?: number; lng?: number; acc?: number; sid?: string };
  const type = String(body.type ?? "");

  try {
    if (type === "ping") {
      const sid = String(body.sid ?? "").slice(0, 64);
      if (!sid) { res.json({ ok: true }); return; }
      const r = await fetch(`${SB_URL}/rest/v1/fl_shop_analytics?id=eq.__online&select=payload`, { headers: readHeaders() });
      const rows = r.ok ? (await r.json()) as { payload?: { sessions?: Record<string, number> } }[] : [];
      const sessions = rows[0]?.payload?.sessions ?? {};
      sessions[sid] = Date.now();
      const cutoff = Date.now() - 600_000;
      for (const k of Object.keys(sessions)) if (sessions[k] < cutoff) delete sessions[k];
      await fetch(`${SB_URL}/rest/v1/fl_shop_analytics`, {
        method: "POST", headers: writeHeaders(),
        body: JSON.stringify({ id: "__online", payload: { sessions }, updated_at: new Date().toISOString() }),
      });
      res.json({ ok: true });
      return;
    }

    if (!["view", "click", "point"].includes(type)) {
      res.status(400).json({ ok: false, error: "type inconnu" });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(`${SB_URL}/rest/v1/fl_shop_analytics?id=eq.${today}&select=payload`, { headers: readHeaders() });
    const rows = r.ok ? (await r.json()) as { payload?: DayPayload }[] : [];
    const payload: DayPayload = rows[0]?.payload ?? {};

    if (type === "view") {
      payload.visits = (payload.visits ?? 0) + 1;
      const page = String(body.page ?? "accueil").slice(0, 60);
      payload.pages = payload.pages ?? {};
      payload.pages[page] = (payload.pages[page] ?? 0) + 1;
    } else if (type === "click") {
      payload.clicks = (payload.clicks ?? 0) + 1;
      const label = String(body.label ?? "").slice(0, 60);
      if (label) {
        payload.events = payload.events ?? {};
        payload.events[label] = (payload.events[label] ?? 0) + 1;
      }
    } else if (type === "point" && typeof body.lat === "number" && typeof body.lng === "number") {
      payload.points = payload.points ?? [];
      payload.points.push({ lat: body.lat, lng: body.lng, acc: body.acc, t: new Date().toISOString(), page: body.page });
      if (payload.points.length > 500) payload.points = payload.points.slice(-500);
    }

    await fetch(`${SB_URL}/rest/v1/fl_shop_analytics`, {
      method: "POST", headers: writeHeaders(),
      body: JSON.stringify({ id: today, payload, updated_at: new Date().toISOString() }),
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
