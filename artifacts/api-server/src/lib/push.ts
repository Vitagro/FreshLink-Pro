// ══════════════════════════════════════════════════════════════════════════════
// Envoi de notifications push (FCM) côté SERVEUR — appelé depuis les points de
// création existants (nouveau message, appel entrant, notification interne) pour
// réveiller l'app même fermée/téléphone verrouillé.
//
// Configuration : FIREBASE_SERVICE_ACCOUNT_JSON — le JSON du compte de service
// Firebase, encodé en base64 (le JSON brut contient des guillemets qui cassent
// la directive Apache SetEnv utilisée par deploy.yml — jamais commité).
// Tant que cette variable est absente, sendPushToUser() ne fait rien (no-op
// silencieux) — même comportement de dégradation gracieuse que lib/email.ts
// quand aucune clé fournisseur n'est configurée.
// ══════════════════════════════════════════════════════════════════════════════

import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
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

let app: App | null | undefined; // undefined = not yet attempted, null = attempted & unavailable

function getFirebaseApp(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) { app = null; return app; }
  try {
    const serviceAccount = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    logger.error("[push] FIREBASE_SERVICE_ACCOUNT_JSON invalide: " + String(e));
    app = null;
  }
  return app;
}

async function getTokensForUser(userId: string): Promise<string[]> {
  if (!SB_SRV) return [];
  const url = `${SB_URL}/rest/v1/fl_device_tokens?select=token&user_id=eq.${encodeURIComponent(userId)}`;
  const r = await fetch(url, { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } });
  if (!r.ok) return [];
  const rows = (await r.json()) as { token: string }[];
  return rows.map((r) => r.token);
}

async function deleteTokens(tokens: string[]): Promise<void> {
  if (!SB_SRV || tokens.length === 0) return;
  const list = tokens.map((t) => `"${t}"`).join(",");
  await fetch(`${SB_URL}/rest/v1/fl_device_tokens?token=in.(${list})`, {
    method: "DELETE",
    headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` },
  }).catch(() => { /* best-effort cleanup */ });
}

export interface PushPayload {
  title: string;
  body?: string;
  tag?: string;   // maps to notify()'s dedup tag on the client
  url?: string;   // opened on notification tap
}

// Best-effort: never throws — a push failure must not break the calling
// feature (message send, call initiation, notification creation).
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    const fb = getFirebaseApp();
    if (!fb || !userId) return;

    const tokens = await getTokensForUser(userId);
    if (tokens.length === 0) return;

    const res = await getMessaging(fb).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: { tag: payload.tag ?? "", url: payload.url ?? "" },
      // channelId doit correspondre au canal créé côté client (notify.ts,
      // registerPush) — sans lui, Android utilise le canal par défaut
      // (importance normale) qui n'affiche PAS de bannière app fermée/réduite,
      // même avec priority:"high" au niveau du message.
      android: { priority: "high", notification: { channelId: "fl_alerts" } },
    });

    const dead: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success && (r.error?.code === "messaging/registration-token-not-registered" || r.error?.code === "messaging/invalid-registration-token")) {
        dead.push(tokens[i]);
      }
    });
    if (dead.length) await deleteTokens(dead);
  } catch (e) {
    logger.error("[push] sendPushToUser a échoué: " + String(e));
  }
}
