import { Router } from "express";
import type { Request, Response } from "express";
import {
  signDeviceToken,
  DEVICE_COOKIE,
  requireDeviceApi,
} from "../../lib/deviceGuard.js";

const router = Router();

const SB_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";

const SB_SRV =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.service_role ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

router.post("/check-and-token", async (req: Request, res: Response) => {
  try {
    const { fingerprint } = req.body as { fingerprint?: string };
    if (!fingerprint) {
      res.status(400).json({ error: "fingerprint requis" });
      return;
    }

    if (!process.env.DEVICE_SECRET) {
      res.status(503).json({ error: "DEVICE_SECRET non configuré" });
      return;
    }

    if (!SB_URL || !SB_SRV) {
      const token = signDeviceToken(fingerprint);
      res.cookie(DEVICE_COOKIE, token, cookieOpts());
      res.json({ approved: true, degraded: true });
      return;
    }

    // Verrou appareil = OPT-IN. Par défaut (pas de config, ou enforce ≠ true),
    // on délivre le jeton à tout appareil → l'ERP se connecte directement.
    // Le verrou ne s'applique QUE si l'admin a explicitement activé enforce=true
    // depuis BO → Accès Appareils. Évite le blocage poule-et-œuf à l'installation.
    let enforce = false;
    try {
      const cfgRes = await fetch(
        `${SB_URL}/rest/v1/fl_site_access?id=eq.__config&select=payload`,
        { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } }
      );
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as Array<{ payload?: { enforce?: boolean } }>;
        enforce = cfg?.[0]?.payload?.enforce === true;
      }
    } catch {}

    if (!enforce) {
      const token = signDeviceToken(fingerprint);
      res.cookie(DEVICE_COOKIE, token, cookieOpts());
      res.json({ approved: true, enforce: false });
      return;
    }

    const sbRes = await fetch(
      `${SB_URL}/rest/v1/fl_site_access?id=eq.${encodeURIComponent(fingerprint)}&select=payload`,
      { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } }
    );

    if (!sbRes.ok) {
      res.status(502).json({ error: "Erreur Supabase" });
      return;
    }

    const rows = (await sbRes.json()) as Array<{ payload?: { statut?: string } }>;
    if (!rows.length) {
      res.json({ approved: false, statut: "not_found" });
      return;
    }

    const statut = rows[0]?.payload?.statut ?? "en_attente";
    if (statut === "autorise") {
      const token = signDeviceToken(fingerprint);
      res.cookie(DEVICE_COOKIE, token, cookieOpts());
      res.json({ approved: true });
      return;
    }
    if (statut === "bloque") {
      res.json({ approved: false, statut: "bloque" });
      return;
    }
    res.json({ approved: false, statut });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/request-access", async (req: Request, res: Response) => {
  try {
    const { fingerprint, nom, phone, gps_lat, gps_lng, gps_precision, userAgent } = req.body;
    if (!fingerprint) {
      res.status(400).json({ error: "fingerprint requis" });
      return;
    }
    if (!SB_URL || !SB_SRV) {
      res.json({ ok: true, deviceId: fingerprint, degraded: true });
      return;
    }
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      device_id: fingerprint,
      nom: nom || null,
      telephone: phone || null,
      statut: "en_attente",
      user_agent: (userAgent || "").slice(0, 250),
      first_visit_at: now,
      updated_at: now,
    };
    if (gps_lat !== undefined && gps_lat !== null) {
      payload.gps_lat = gps_lat;
      payload.gps_lng = gps_lng;
      payload.gps_precision = gps_precision;
    }
    const sbRes = await fetch(`${SB_URL}/rest/v1/fl_site_access`, {
      method: "POST",
      headers: {
        apikey: SB_SRV,
        Authorization: `Bearer ${SB_SRV}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({ id: fingerprint, payload, updated_at: now }),
    });
    if (!sbRes.ok && sbRes.status !== 409) {
      console.error("[request-access] Supabase:", sbRes.status, await sbRes.text());
    }
    res.json({ ok: true, deviceId: fingerprint });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/seen", async (req: Request, res: Response) => {
  if (!SB_SRV) {
    res.json({ ok: false });
    return;
  }
  const { fingerprint, nom, userAgent } = req.body as {
    fingerprint?: string;
    nom?: string;
    userAgent?: string;
  };
  if (!fingerprint || fingerprint.length < 8) {
    res.json({ ok: false });
    return;
  }
  const hdr = {
    apikey: SB_SRV,
    Authorization: `Bearer ${SB_SRV}`,
    "Content-Type": "application/json",
  };
  let payload: Record<string, unknown> = {};
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/fl_site_access?id=eq.${encodeURIComponent(fingerprint)}&select=payload`,
      { headers: hdr }
    );
    if (r.ok) {
      const rows = await r.json() as Array<{ payload?: Record<string, unknown> }>;
      payload = rows?.[0]?.payload ?? {};
    }
  } catch {}

  const now = new Date().toISOString();
  const history: string[] = Array.isArray(payload.connections)
    ? (payload.connections as string[])
    : [];
  const last = history[history.length - 1];
  if (!last || Date.now() - new Date(last).getTime() > 5 * 60 * 1000) history.push(now);

  const next = {
    ...payload,
    device_id: payload.device_id ?? fingerprint,
    first_visit_at: payload.first_visit_at ?? now,
    last_seen: now,
    connections: history.slice(-50),
    ...(nom && !payload.nom ? { nom } : {}),
    ...(userAgent && !payload.user_agent ? { user_agent: userAgent } : {}),
    statut: payload.statut ?? "en_attente",
  };
  try {
    await fetch(`${SB_URL}/rest/v1/fl_site_access`, {
      method: "POST",
      headers: { ...hdr, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: fingerprint, payload: next, updated_at: now }),
    });
  } catch {}
  res.json({ ok: true });
});

export default router;
