"use client"
// ════════════════════════════════════════════════════════════════════════════
//  notify — sons + notifications navigateur (appels, messages, alertes), plus
//  notifications push natives (registerPush) quand l'app tourne dans le wrapper
//  mobile Capacitor — celles-ci arrivent même app fermée/téléphone verrouillé,
//  contrairement au reste de ce module qui exige un onglet ouvert.
//  L'AudioContext doit être "débloqué" par un geste utilisateur → unlockAudio().
// ════════════════════════════════════════════════════════════════════════════

import { Capacitor } from "@capacitor/core"
import { PushNotifications, type Token, type PushNotificationSchema, type ActionPerformed } from "@capacitor/push-notifications"

let audioCtx: AudioContext | null = null
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      audioCtx = new AC()
    }
    return audioCtx
  } catch { return null }
}

// À appeler sur un geste utilisateur (login, clic) → autorise le son ensuite.
export function unlockAudio(): void {
  const c = ctx()
  try { if (c && c.state === "suspended") void c.resume() } catch { /* noop */ }
}

// Bip court (message / alerte).
export function beep(freq = 880, ms = 180, vol = 0.18): void {
  const c = ctx(); if (!c) return
  try {
    if (c.state === "suspended") void c.resume()
    const o = c.createOscillator(), g = c.createGain()
    o.type = "sine"; o.frequency.value = freq
    g.gain.value = vol
    o.connect(g); g.connect(c.destination)
    o.start()
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000)
    o.stop(c.currentTime + ms / 1000)
  } catch { /* noop */ }
}

// Sonnerie d'appel (boucle de deux tons) — renvoie une fonction stop().
export function ring(): () => void {
  let stopped = false
  const tone = () => {
    if (stopped) return
    beep(880, 380, 0.22)
    setTimeout(() => { if (!stopped) beep(660, 380, 0.22) }, 430)
  }
  tone()
  const timer = setInterval(tone, 1500)
  return () => { stopped = true; clearInterval(timer) }
}

// Demande la permission de notifier (idéalement sur un geste utilisateur).
export async function requestNotifyPermission(): Promise<void> {
  try {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission()
    }
  } catch { /* noop */ }
}

// Affiche une notification navigateur (si autorisée). Optionnellement vibre.
export function notify(title: string, body?: string, tag?: string): void {
  try {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return
    const n = new Notification(title, { body, tag, icon: "/icon-192.png", badge: "/icon-192.png" })
    n.onclick = () => { try { window.focus() } catch { /* noop */ } n.close() }
    setTimeout(() => { try { n.close() } catch { /* noop */ } }, 9000)
    try { navigator.vibrate?.([120, 60, 120]) } catch { /* noop */ }
  } catch { /* noop */ }
}

export function isHidden(): boolean {
  return typeof document !== "undefined" && document.hidden
}

// ── Web Push (VAPID) — PWA installée, Android Chrome et iOS 16.4+ Safari ──────
// Contrairement à registerPush() (FCM, app native Capacitor compilée — cas non
// utilisé aujourd'hui, cette app est distribuée comme PWA), c'est CE chemin
// qui permet de recevoir une notification app fermée/réduite pour la quasi
// totalité des utilisateurs réels. Sans effet si le navigateur ne supporte pas
// Service Worker + Push (repli silencieux sur les notifications foreground de
// notify()/CutoffNotifier existantes).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64Safe)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

let webPushAttempted = false

export async function registerWebPush(userId: string): Promise<void> {
  if (typeof window === "undefined" || webPushAttempted || !userId) return
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return
  webPushAttempted = true

  try {
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") { webPushAttempted = false; return }
    }
    if (Notification.permission !== "granted") return

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const keyRes = await fetch("/api/ext/push/vapid-public-key")
      if (!keyRes.ok) return // Web Push pas configuré côté serveur (VAPID absent) — no-op
      const { publicKey } = await keyRes.json() as { publicKey: string }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

    await fetch("/api/ext/push/web-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subscription: json }),
    }).catch(() => { /* best-effort — retry next login */ })
  } catch {
    webPushAttempted = false
  }
}

// ── Push natif (app mobile Capacitor uniquement) ──────────────────────────────
// Enregistre l'appareil pour les notifications push FCM et envoie le token au
// serveur pour cet utilisateur. Sans effet dans un navigateur classique (web).

// Canal Android à importance MAX, créé INDÉPENDAMMENT du flux permission/
// enregistrement (aucune permission requise pour définir un canal — seule
// l'ENVOI d'une notif dessus l'exige). Android ignore silencieusement toute
// notif visant un canal qui n'existe pas encore sur l'appareil : le créer
// APRÈS le check de permission (comme avant) laissait une fenêtre où un push
// arrivant tôt (ou un aléa dans le flux permission) le rendait invisible —
// sans ça, importance par défaut (3) = pas de bannière ni son non plus.
let channelReady = false
async function ensureAlertChannel(): Promise<void> {
  if (channelReady || !Capacitor.isNativePlatform()) return
  channelReady = true
  try {
    await PushNotifications.createChannel({
      id: "fl_alerts",
      name: "Alertes FreshLink Pro",
      description: "Appels, messages et notifications importantes",
      importance: 5,
      visibility: 1,
      vibration: true,
    })
  } catch {
    channelReady = false // permet de retenter au prochain appel
  }
}

let pushRegistered = false

export async function registerPush(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || pushRegistered || !userId) return
  pushRegistered = true
  await ensureAlertChannel()

  try {
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === "prompt") perm = await PushNotifications.requestPermissions()
    if (perm.receive !== "granted") { pushRegistered = false; return }

    // Les écouteurs DOIVENT être posés AVANT register() : l'évènement
    // "registration" peut arriver quasi immédiatement (token déjà connu côté
    // natif, ex. déjà enregistré lors d'un lancement précédent) — l'ajouter
    // après l'await de register() risque de manquer complètement l'évènement,
    // auquel cas le token n'est jamais envoyé au serveur et aucune notification
    // ne peut jamais arriver, silencieusement, sans aucune erreur visible.
    PushNotifications.addListener("registration", (token: Token) => {
      fetch("/api/ext/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, token: token.value, platform: Capacitor.getPlatform() }),
      }).catch(() => { /* best-effort — will retry next app launch */ })
    })

    PushNotifications.addListener("registrationError", () => { pushRegistered = false })

    // Foreground push: also mirror it through the existing in-app notify() so
    // behavior is consistent whether the app was open or closed on arrival.
    PushNotifications.addListener("pushNotificationReceived", (n: PushNotificationSchema) => {
      notify(n.title || "FreshLink Pro", n.body, n.data?.tag)
    })

    PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
      const url = action.notification.data?.url
      if (url && typeof window !== "undefined") window.location.href = url
    })

    await PushNotifications.register()
  } catch {
    pushRegistered = false
  }
}
