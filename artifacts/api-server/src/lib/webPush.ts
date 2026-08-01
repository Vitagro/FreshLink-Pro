// ══════════════════════════════════════════════════════════════════════════════
// Envoi de notifications Web Push (VAPID) côté SERVEUR — complément web de
// lib/push.ts (FCM natif Capacitor). Cette app est distribuée comme PWA
// installable, pas comme app native compilée, donc c'est CE chemin qui réveille
// l'app pour la majorité des utilisateurs (app fermée/réduite, Android Chrome
// et iOS 16.4+ Safari en PWA installée).
//
// Configuration : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (mailto:... ou https://...). Tant que ces variables sont absentes,
// sendWebPushToUser() ne fait rien (no-op silencieux) — même comportement de
// dégradation gracieuse que lib/push.ts (FCM) et lib/email.ts.
// ══════════════════════════════════════════════════════════════════════════════

import webpush from "web-push";
import { logger } from "./logger.js";

const SB_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";
const SB_SRV =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.service_role ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

let vapidReady: boolean | undefined; // undefined = not yet attempted

function ensureVapid(): boolean {
  if (vapidReady !== undefined) return vapidReady;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:contact@vitafresh.ma";
  if (!pub || !priv) { vapidReady = false; return vapidReady; }
  try {
    webpush.setVapidDetails(subject, pub, priv);
    vapidReady = true;
  } catch (e) {
    logger.error("[webPush] VAPID keys invalides: " + String(e));
    vapidReady = false;
  }
  return vapidReady;
}

// Clé publique VAPID exposée au client pour pushManager.subscribe() — pas de
// secret ici, une clé publique VAPID est faite pour être distribuée.
export function getVapidPublicKey(): string | null {
  return ensureVapid() ? (process.env.VAPID_PUBLIC_KEY ?? null) : null;
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function getSubscriptionsForUser(userId: string): Promise<StoredSubscription[]> {
  if (!SB_SRV) return [];
  const url = `${SB_URL}/rest/v1/fl_web_push_subscriptions?select=endpoint,p256dh,auth&user_id=eq.${encodeURIComponent(userId)}`;
  const r = await fetch(url, { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } });
  if (!r.ok) return [];
  return (await r.json()) as StoredSubscription[];
}

async function deleteSubscriptions(endpoints: string[]): Promise<void> {
  if (!SB_SRV || endpoints.length === 0) return;
  const list = endpoints.map((e) => `"${e}"`).join(",");
  await fetch(`${SB_URL}/rest/v1/fl_web_push_subscriptions?endpoint=in.(${list})`, {
    method: "DELETE",
    headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` },
  }).catch(() => { /* best-effort cleanup */ });
}

export interface WebPushPayload {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
}

// Best-effort: never throws — a push failure must not break the calling
// feature (message send, call initiation, notification creation).
export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<void> {
  try {
    if (!ensureVapid() || !userId) return;

    const subs = await getSubscriptionsForUser(userId);
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      url: payload.url ?? "/",
    });

    const dead: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (e) {
        // 404/410 = abonnement expiré/révoqué (désinstallation, permission
        // retirée) — nettoyage, comme les tokens FCM morts dans lib/push.ts.
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint);
        else logger.error("[webPush] envoi échoué: " + String(e));
      }
    }));
    if (dead.length) await deleteSubscriptions(dead);
  } catch (e) {
    logger.error("[webPush] sendWebPushToUser a échoué: " + String(e));
  }
}
