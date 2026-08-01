import { Router } from "express";
import type { Request, Response } from "express";
import { getVapidPublicKey } from "../../lib/webPush.js";

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
  next();
});

// Called by the mobile client (see src/lib/notify.ts:registerPush) once it has
// obtained an FCM token from the OS. Upserts on `token` — a device that
// re-registers (app reinstall, token refresh) just updates its row.
router.post("/register", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }
  const { userId, token, platform } = req.body as { userId?: string; token?: string; platform?: string };
  if (!userId || !token) { res.status(400).json({ ok: false, error: "userId et token requis" }); return; }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_device_tokens?on_conflict=token`, {
      method: "POST",
      headers: {
        apikey: SB_SRV,
        Authorization: `Bearer ${SB_SRV}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        token,
        platform: platform ?? "android",
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Clé publique VAPID — le client la récupère ici plutôt que de la coder en
// dur dans le bundle, pour pouvoir la faire tourner côté serveur sans
// redéploiement du front. Pas de secret exposé (clé publique par nature).
router.get("/vapid-public-key", (_req: Request, res: Response) => {
  const key = getVapidPublicKey();
  if (!key) { res.status(404).json({ ok: false, error: "Web Push non configuré (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY absents)" }); return; }
  res.json({ ok: true, publicKey: key });
});

// Appelé par le client web (voir src/lib/notify.ts:registerWebPush) une fois
// abonné via pushManager.subscribe(). Upsert sur `endpoint` — un même
// utilisateur peut avoir plusieurs abonnements (plusieurs appareils/navigateurs).
router.post("/web-subscribe", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }
  const { userId, subscription } = req.body as {
    userId?: string;
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!userId || !endpoint || !p256dh || !auth) {
    res.status(400).json({ ok: false, error: "userId et subscription (endpoint, keys.p256dh, keys.auth) requis" });
    return;
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_web_push_subscriptions?on_conflict=endpoint`, {
      method: "POST",
      headers: {
        apikey: SB_SRV,
        Authorization: `Bearer ${SB_SRV}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Appelé quand pushManager retourne une subscription expirée/révoquée côté
// navigateur (ex: permission retirée) — nettoyage explicite en plus du
// nettoyage automatique côté envoi (404/410 dans lib/webPush.ts).
router.post("/web-unsubscribe", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ ok: false, error: "endpoint requis" }); return; }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_web_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: "DELETE",
      headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` },
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
