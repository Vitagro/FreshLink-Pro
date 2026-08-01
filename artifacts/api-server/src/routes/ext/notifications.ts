import { Router } from "express";
import type { Request, Response } from "express";
import { sendPushToUser } from "../../lib/push.js";
import { sendWebPushToUser } from "../../lib/webPush.js";

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

const SERVICES = ["achats", "sales", "transport", "direction", "prevendeur", "client", "all"];

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, GET, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

router.get("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }
  const service = req.query["service"] as string | undefined;
  const lu = req.query["lu"] as string | undefined;
  let url = `${SB_URL}/rest/v1/fl_notifications?select=*&order=created_at.desc&limit=200`;
  if (service) url += `&or=(service.eq.${encodeURIComponent(service)},service.eq.all)`;
  if (lu != null) url += `&lu=eq.${lu === "true"}`;
  try {
    const r = await fetch(url, { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true, data: await r.json() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }
  const body = req.body as Record<string, unknown>;
  const service = String(body.service ?? "");
  if (!SERVICES.includes(service)) {
    res.status(400).json({ ok: false, error: `service invalide (${SERVICES.join(", ")})` });
    return;
  }
  if (!body.titre) { res.status(400).json({ ok: false, error: "titre requis" }); return; }
  const id = "NT" + Date.now().toString(36).toUpperCase();
  const row = {
    id, service,
    destinataire_id: body.destinataireId ?? null,
    type: body.type ?? "info",
    titre: String(body.titre),
    corps: body.corps ?? null,
    priorite: body.priorite ?? "normale",
    lu: false,
    payload: body.payload ?? {},
    created_at: new Date().toISOString(),
  };
  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_notifications`, {
      method: "POST",
      headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true, id });

    // Best-effort push — never blocks or fails the response above. Envoie sur
    // les deux canaux : FCM natif (Capacitor, si l'app tourne en app compilée)
    // et Web Push (PWA installée, le cas réel de la majorité des utilisateurs
    // aujourd'hui) — chacun no-op silencieusement si l'utilisateur n'a pas
    // d'abonnement sur ce canal.
    if (row.destinataire_id) {
      const dest = String(row.destinataire_id);
      const corps = row.corps ? String(row.corps) : undefined;
      void sendPushToUser(dest, { title: row.titre, body: corps, tag: id });
      void sendWebPushToUser(dest, { title: row.titre, body: corps, tag: id });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.patch("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false }); return; }
  const { id, lu } = req.body as { id?: string; lu?: boolean };
  if (!id) { res.status(400).json({ ok: false, error: "id requis" }); return; }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_notifications?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ lu: lu ?? true }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
